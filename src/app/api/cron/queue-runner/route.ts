import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQueue } from "@/lib/queue-runner";
import {
  isTodayHolidayWIBAsync,
  holidayDataLooksStale,
  todayWIB,
} from "@/lib/holidays-id";

// Vercel Hobby caps at 60s. Cron path runs without inter-email delay, so a
// batch of ~18 emails (Gmail API + DB writes per send) fits comfortably.
export const maxDuration = 60;

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
  // Order by last_run_at ASC (NULLS FIRST) so the most-starved queue is served
  // first. All active queues are processed sequentially inside ONE serverless
  // invocation capped at maxDuration (60s); with several workspaces a full tick
  // can't drain everyone in 60s. Without fair ordering the queue that sorts last
  // (e.g. the newest workspace) is starved every single tick — it only ever got
  // sends on the final window tick after the others hit their daily target.
  // Least-recently-run-first rotates that pressure so nobody is permanently
  // skipped.
  const { data: queues } = await admin
    .from("send_queues")
    .select(
      "id, schedule_days, schedule_start_time, schedule_end_time, daily_target, is_one_shot, scheduled_start_at, last_run_at",
    )
    .eq("is_active", true)
    .eq("test_mode", false)
    .order("last_run_at", { ascending: true, nullsFirst: true });

  const results: Array<{ id: string; sent: number; failed: number; mode: string }> = [];

  // Wall-clock guard. Stop starting a new queue once we're close to the
  // function's hard timeout — a kill mid-send orphans 'sending' rows (the
  // post-send status write never lands), which then look sent to the dedup
  // pass and silently suppress that contact. Remaining queues are picked up
  // next tick, and fair ordering above guarantees they rotate to the front.
  const RUN_BUDGET_MS = 50_000;
  const startedAtMs = now.getTime();
  let stoppedEarly = false;

  for (const q of queues ?? []) {
    if (Date.now() - startedAtMs > RUN_BUDGET_MS) {
      stoppedEarly = true;
      break;
    }
    const queue = q as {
      id: string;
      schedule_days: number[];
      schedule_start_time: string;
      schedule_end_time: string;
      daily_target: number;
      is_one_shot: boolean;
      scheduled_start_at: string | null;
    };

    if (queue.is_one_shot) {
      // One-shot: only check scheduled_start_at (if set, must have passed)
      if (
        queue.scheduled_start_at &&
        new Date(queue.scheduled_start_at) > now
      ) {
        continue;
      }

      // Send up to daily_target this tick (rate limit). For one-shot we want
      // it to drain fast, so use full daily_target as batch size each run.
      // Cron is every 30min, so daily_target/run is acceptable rate.
      // applyDelay=false: serverless function timeout is ~60s, so we can't
      // afford 30-90s human-like delays between emails. Cron interval (30min)
      // is the rate limit instead.
      const batchSize = Math.max(1, queue.daily_target);
      const result = await runQueue(queue.id, batchSize, false);
      results.push({
        id: result.queue_id,
        sent: result.sent,
        failed: result.failed,
        mode: "one_shot",
      });
    } else {
      // Recurring: respect schedule_days + window
      const days = queue.schedule_days ?? [];
      if (!days.includes(dowIso)) continue;
      const startT = queue.schedule_start_time;
      const endT = queue.schedule_end_time;
      if (currentTime < startT || currentTime > endT) continue;

      // Spread daily_target across remaining 30-min ticks until end_time
      const minutesLeft = parseTimeMinutes(endT) - parseTimeMinutes(currentTime);
      const ticksLeft = Math.max(1, Math.ceil(minutesLeft / 30));
      const batchSize = Math.max(1, Math.ceil(queue.daily_target / ticksLeft));

      const result = await runQueue(queue.id, batchSize, false);
      results.push({
        id: result.queue_id,
        sent: result.sent,
        failed: result.failed,
        mode: "recurring",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    triggered_at: now.toISOString(),
    queues_processed: results.length,
    queues_total: (queues ?? []).length,
    stopped_early: stoppedEarly,
    results,
  });
}

function parseTimeMinutes(t: string): number {
  const [h, m] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
