import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFollowupsForQueue } from "@/lib/followup-runner";
import {
  isTodayHolidayWIBAsync,
  holidayDataLooksStale,
  todayWIB,
} from "@/lib/holidays-id";

// 10 followups max per queue × ~1–2s per Gmail send = ~20s worst case.
// 30s ceiling keeps Provisioned Memory budget tight.
export const maxDuration = 30;

/**
 * Cron-triggered follow-up sender. Runs every hour in production.
 * For each active queue with followup_enabled, sends follow-ups to
 * recipients sent N+ days ago who haven't replied and haven't received
 * a follow-up yet.
 *
 * Auth: X-Cron-Secret header.
 *
 * Manual:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/followup-runner
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

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
      queues_checked: 0,
    });
  }

  if (await holidayDataLooksStale(admin)) {
    console.warn(
      `[followup-runner] Holiday data appears stale for year ${todayWIB().slice(0, 4)}. ` +
        `Refresh-holidays cron may have stopped.`,
    );
  }

  // Exclude test_mode queues — those send only to the owner's inbox via
  // "Run Now" and must NEVER fire follow-ups at the real contacts recorded
  // during the test run. Do NOT filter on followup_template_id: queues
  // configured with the newer `followup_steps` array leave the legacy
  // followup_template_id NULL, and that filter silently skipped them.
  // runFollowupsForQueue resolves steps (steps → legacy fallback) and returns
  // early when none are configured.
  const { data: allQueues } = await admin
    .from("send_queues")
    .select("id, schedule_days, schedule_start_time, schedule_end_time")
    .eq("is_active", true)
    .eq("followup_enabled", true)
    .eq("test_mode", false);

  // Follow-ups go out inside the queue's own send window (days + hours), the
  // same slot as first touches — the hourly cron runs 08:00–18:00 WIB.
  const wibNow = new Date(Date.now() + 7 * 3600 * 1000);
  const dowIso = wibNow.getUTCDay() === 0 ? 7 : wibNow.getUTCDay();
  const currentTime = wibNow.toISOString().slice(11, 19);
  const queues = (allQueues ?? []).filter((q) => {
    const r = q as {
      schedule_days: number[] | null;
      schedule_start_time: string | null;
      schedule_end_time: string | null;
    };
    if (r.schedule_days && !r.schedule_days.includes(dowIso)) return false;
    if (r.schedule_start_time && currentTime < r.schedule_start_time) return false;
    if (r.schedule_end_time && currentTime > r.schedule_end_time) return false;
    return true;
  });

  const results = [];
  for (const q of queues) {
    const id = (q as { id: string }).id;
    try {
      const r = await runFollowupsForQueue(id);
      results.push(r);
    } catch (err) {
      // One queue's failure must not abort the whole cron run.
      console.error(`[followup-runner] queue ${id} failed:`, err);
      results.push({
        queue_id: id,
        attempted: 0,
        sent: 0,
        failed: 0,
        errors: [err instanceof Error ? err.message : "unknown error"],
        by_step: {},
      });
    }
  }

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    queues_checked: results.length,
    total_sent: results.reduce((sum, r) => sum + r.sent, 0),
    results,
  });
}
