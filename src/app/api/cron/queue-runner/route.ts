import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQueue } from "@/lib/queue-runner";

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

  // WIB = UTC+7. Compute current day-of-week and time in WIB.
  const now = new Date();
  const wibNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const dow = wibNow.getUTCDay(); // 0=Sun .. 6=Sat
  const dowIso = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
  const hh = String(wibNow.getUTCHours()).padStart(2, "0");
  const mm = String(wibNow.getUTCMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}:00`;

  // Active queues that aren't in test mode and have pending recipients
  const { data: queues } = await admin
    .from("send_queues")
    .select(
      "id, schedule_days, schedule_start_time, schedule_end_time, daily_target, total_pending, is_one_shot, scheduled_start_at",
    )
    .eq("is_active", true)
    .eq("test_mode", false)
    .gt("total_pending", 0);

  const results: Array<{ id: string; sent: number; failed: number; mode: string }> = [];

  for (const q of queues ?? []) {
    const queue = q as {
      id: string;
      schedule_days: number[];
      schedule_start_time: string;
      schedule_end_time: string;
      daily_target: number;
      total_pending: number;
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
    results,
  });
}

function parseTimeMinutes(t: string): number {
  const [h, m] = t.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}
