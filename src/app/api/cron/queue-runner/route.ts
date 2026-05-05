import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runQueue } from "@/lib/queue-runner";

/**
 * Cron-triggered queue runner. Called via pg_cron + pg_net every 30 minutes
 * during business hours (08:00-18:00 WIB = 01:00-11:00 UTC) in production.
 *
 * Authentication: requires X-Cron-Secret header matching CRON_SECRET env var.
 *
 * Logic:
 * 1. Find all is_active queues whose schedule_days/schedule_*_time matches now
 * 2. For each, call runQueue() with batch limited by per-queue daily target
 *
 * In dev, you can trigger manually:
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
  const dowIso = dow === 0 ? 7 : dow; // we use 1=Mon..7=Sun convention in schedule_days
  const hh = String(wibNow.getUTCHours()).padStart(2, "0");
  const mm = String(wibNow.getUTCMinutes()).padStart(2, "0");
  const currentTime = `${hh}:${mm}:00`;

  const { data: queues } = await admin
    .from("send_queues")
    .select("id, schedule_days, schedule_start_time, schedule_end_time, daily_target, total_pending")
    .eq("is_active", true)
    .gt("total_pending", 0);

  const results: Array<{ id: string; sent: number; failed: number }> = [];
  for (const q of queues ?? []) {
    const days = (q as { schedule_days: number[] }).schedule_days ?? [];
    if (!days.includes(dowIso)) continue;
    const startT = (q as { schedule_start_time: string }).schedule_start_time;
    const endT = (q as { schedule_end_time: string }).schedule_end_time;
    if (currentTime < startT || currentTime > endT) continue;

    // Batch size: spread daily_target across remaining 30-min ticks until end_time
    const minutesLeft = parseTimeMinutes(endT) - parseTimeMinutes(currentTime);
    const ticksLeft = Math.max(1, Math.ceil(minutesLeft / 30));
    const dailyTarget = (q as { daily_target: number }).daily_target;
    const batchSize = Math.max(1, Math.ceil(dailyTarget / ticksLeft));

    const result = await runQueue((q as { id: string }).id, batchSize, true);
    results.push({
      id: result.queue_id,
      sent: result.sent,
      failed: result.failed,
    });
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
