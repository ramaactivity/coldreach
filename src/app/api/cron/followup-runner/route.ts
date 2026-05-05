import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFollowupsForQueue } from "@/lib/followup-runner";

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

  const { data: queues } = await admin
    .from("send_queues")
    .select("id")
    .eq("is_active", true)
    .eq("followup_enabled", true)
    .not("followup_template_id", "is", null);

  const results = [];
  for (const q of queues ?? []) {
    const id = (q as { id: string }).id;
    const r = await runFollowupsForQueue(id);
    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    queues_checked: results.length,
    total_sent: results.reduce((sum, r) => sum + r.sent, 0),
    results,
  });
}
