import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQueue } from "@/lib/queue-runner";
import { startOfTodayWibIso } from "@/lib/quota-reset";
import {
  isTodayHolidayWIBAsync,
  holidayDataLooksStale,
  todayWIB,
} from "@/lib/holidays-id";

// Vercel Hobby caps at 60s. Cron path runs without inter-email delay, and
// all workspace queues now send in parallel inside this one invocation.
export const maxDuration = 60;

// How often pg_cron hits this route, in minutes. MUST match the
// `coldreach-queue-runner` schedule in Supabase (currently */15) — the batch
// pacing below divides the day's remaining target by the ticks left, so a
// value larger than reality under-sends.
const TICK_MINUTES = 15;

// Minutes before schedule_end_time that the pacing plan aims to be finished.
// Everything still owed inside this tail is sent as one catch-up batch, which
// is what guarantees the account actually reaches its daily quota even after
// a bad tick earlier in the day.
const CATCHUP_RESERVE_MIN = 60;

/**
 * Cron-triggered queue runner. Called by pg_cron + pg_net every 30 minutes
 * during business hours in production.
 *
 * Two modes processed:
 *   - Recurring queues: filter by schedule_days + start/end time window
 *   - One-shot campaigns: ignore recurring window, respect scheduled_start_at
 *
 * Test-mode queues are always skipped — those run only via manual "Run Now".
 *
 * Manual trigger:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/queue-runner
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Skip the entire run on Indonesian national holidays + cuti bersama —
  // corporate inboxes are dead, sends would just sit there until the
  // next workday and look weirdly automated. Data is auto-refreshed
  // daily from a public API into `id_holidays`; the hardcoded set in
  // holidays-id.ts is offline fallback.
  const holiday = await isTodayHolidayWIBAsync(admin);
  if (holiday) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: holiday.is_cuti_bersama
        ? "indonesian_cuti_bersama"
        : "indonesian_national_holiday",
      holiday: holiday.name,
      source: holiday.source,
      date_wib: todayWIB(),
      queues_processed: 0,
    });
  }

  // Warn when the hardcoded fallback is exhausted AND the DB has no rows
  // for the current year — without that data, we'd silently send on
  // real holidays. This shouldn't block the run, but it's worth logging.
  if (await holidayDataLooksStale(admin)) {
    console.warn(
      `[queue-runner] Holiday data appears stale for year ${todayWIB().slice(0, 4)}. ` +
        `Refresh-holidays cron may have stopped. Sends are continuing as best-effort.`,
    );
    await admin.from("activity_log").insert({
      activity_type: "holidays_stale_warning",
      entity_type: "id_holidays",
      metadata: { date_wib: todayWIB() },
    });
  }

  // WIB = UTC+7. Compute current day-of-week and time in WIB.
  const now = new Date();
  const wibNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const dow = wibNow.getUTCDay(); // 0=Sun .. 6=Sat
  const dowIso = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
  const hh = String(wibNow.getUTCHours()).padStart(2, "0");
  const mm = String(wibNow.getUTCMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}:00`;

  // Active, non-test queues. We deliberately DON'T filter on the cached
  // `total_pending` counter here: it's a denormalized cache that drifts
  // (skips/external inserts don't keep it in sync), and gating on it once
  // caused a queue to silently flatline — cached counter hit 0 while real
  // pending rows still existed, so the queue was filtered out of every tick
  // and its self-healing refill/resync (inside runQueue) never ran. runQueue
  // is the single source of truth: it queries the real pending rows, refills
  // evergreen audiences, resyncs the counters, and returns early when there's
  // genuinely nothing to send. Schedule-window checks below keep us from
  // calling it on out-of-window queues.
  // Queues run CONCURRENTLY below (see Promise.all), so ordering is only a
  // tiebreak for the shared wall-clock budget. Least-recently-run first keeps
  // the historically starved queue in front. Sequential processing was the
  // single biggest reason accounts never reached their daily quota: every
  // workspace shared one 50s budget, so only the first ~2 queues of each tick
  // ever sent and the rest were skipped entirely.
  const { data: queues } = await admin
    .from("send_queues")
    .select(
      "id, schedule_days, schedule_start_time, schedule_end_time, daily_target, is_one_shot, scheduled_start_at, last_run_at",
    )
    .eq("is_active", true)
    .eq("test_mode", false)
    .order("last_run_at", { ascending: true, nullsFirst: true });

  // Wall-clock guard, shared by every queue. Sends stop cleanly before the
  // function's hard timeout — a kill mid-send orphans 'sending' rows (the
  // post-send status write never lands), which then look sent to the dedup
  // pass and silently suppress that contact.
  const RUN_BUDGET_MS = 50_000;
  const startedAtMs = now.getTime();
  const sendDeadlineMs = startedAtMs + RUN_BUDGET_MS;
  const wibDayStart = startOfTodayWibIso(now);

  type QueueRow = {
    id: string;
    schedule_days: number[];
    schedule_start_time: string;
    schedule_end_time: string;
    daily_target: number;
    is_one_shot: boolean;
    scheduled_start_at: string | null;
  };

  // Phase 1 — decide, in parallel, what (if anything) each queue should send
  // this tick. Only the "sent today" count needs a round trip, and those all
  // fly at once instead of one-at-a-time in front of each send.
  const plans = await Promise.all(
    ((queues ?? []) as QueueRow[]).map(async (queue) => {
      if (queue.is_one_shot) {
        // One-shot: only check scheduled_start_at (if set, must have passed).
        if (queue.scheduled_start_at && new Date(queue.scheduled_start_at) > now) {
          return null;
        }
        // Drain fast — full daily_target per tick; the cron interval is the
        // rate limit. applyDelay=false: we can't afford 30-90s human-like
        // gaps inside a 60s function.
        return {
          id: queue.id,
          mode: "one_shot" as const,
          batchSize: Math.max(1, queue.daily_target),
        };
      }

      // Recurring: respect schedule_days + window.
      const days = queue.schedule_days ?? [];
      if (!days.includes(dowIso)) return null;
      const startT = queue.schedule_start_time;
      const endT = queue.schedule_end_time;
      if (currentTime < startT || currentTime > endT) return null;

      // Spread the REMAINING-today target across the remaining ticks. Sizing
      // off the full daily_target every tick made a queue send far more than
      // its target over a day (ceil(target/ticksLeft) summed over an N-tick
      // window ≈ target·ln(N)); subtracting what already went out today keeps
      // the shape flat instead of back-loading everything into the last hour.
      const { count: sentTodayForQueue } = await admin
        .from("queue_recipients")
        .select("id", { count: "exact", head: true })
        .eq("queue_id", queue.id)
        .eq("status", "sent")
        .gte("sent_at", wibDayStart);
      const remainingToday = Math.max(
        0,
        queue.daily_target - (sentTodayForQueue ?? 0),
      );
      if (remainingToday === 0) return null;

      const minutesLeft = parseTimeMinutes(endT) - parseTimeMinutes(currentTime);
      // Aim to finish the daily target CATCHUP_RESERVE_MIN before the window
      // closes, so a tick that under-delivers (Gmail hiccup, cold start) still
      // has real ticks left to make it up. Inside the reserve, ticksLeft
      // collapses to 1 and the batch becomes "everything still owed" — the
      // catch-up pass that actually gets the account to its max.
      const usableMinutesLeft = Math.max(0, minutesLeft - CATCHUP_RESERVE_MIN);
      const ticksLeft = Math.max(1, Math.ceil(usableMinutesLeft / TICK_MINUTES));
      return {
        id: queue.id,
        mode: "recurring" as const,
        batchSize: Math.max(1, Math.ceil(remainingToday / ticksLeft)),
      };
    }),
  );

  // Phase 2 — run every eligible queue CONCURRENTLY. Each queue has its own
  // Gmail account and its own recipient pool, so the only shared resource is
  // wall-clock; running them sequentially meant the tail queues never sent.
  // Cross-workspace double-sends are prevented atomically inside runQueue
  // (claim_contact_send), not by serializing the runners.
  const eligible = plans.filter((p): p is NonNullable<typeof p> => p !== null);
  const settled = await Promise.allSettled(
    eligible.map((p) => runQueue(p.id, p.batchSize, false, sendDeadlineMs)),
  );

  const results = settled.map((s, i) => {
    const plan = eligible[i];
    if (s.status === "fulfilled") {
      return {
        id: plan.id,
        planned: plan.batchSize,
        sent: s.value.sent,
        failed: s.value.failed,
        skipped: s.value.skipped,
        mode: plan.mode,
        errors: s.value.errors.slice(0, 3),
      };
    }
    // One queue blowing up must not lose the other queues' results.
    console.error(`[queue-runner] queue ${plan.id} threw:`, s.reason);
    return {
      id: plan.id,
      planned: plan.batchSize,
      sent: 0,
      failed: 0,
      skipped: 0,
      mode: plan.mode,
      errors: [s.reason instanceof Error ? s.reason.message : "unknown error"],
    };
  });

  return NextResponse.json({
    ok: true,
    triggered_at: now.toISOString(),
    elapsed_ms: Date.now() - startedAtMs,
    queues_processed: results.length,
    queues_total: (queues ?? []).length,
    // True when the shared budget cut a send loop short — the signal to watch
    // if daily totals ever drift below target again.
    hit_time_budget: Date.now() >= sendDeadlineMs,
    results,
  });
}

function parseTimeMinutes(t: string): number {
  const [h, m] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
