import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAudienceGraduation, runQuotaRamp } from "@/lib/quota-ramp";

// Beberapa count query per akun aktif (sedikit) — selesai dalam hitungan
// detik; 30s ceiling longgar.
export const maxDuration = 30;

/**
 * Daily cron — auto-ramp daily_quota (+10/hari, maks 500) untuk akun sehat
 * yang quotanya kepakai. pg_cron schedule: 0 16 * * 1-5 UTC (= 23:00 WIB,
 * setelah window kirim tutup 17:00 WIB dan sebelum quota reset 00:00 WIB —
 * emails_sent_today masih berisi utilisasi hari itu).
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env.
 *
 * Manual:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/quota-ramp
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runQuotaRamp(admin);
  // Same nightly health check decides whether a "proven contacts only" queue
  // may move to the full pool (or must move back).
  const audience = await runAudienceGraduation(admin);

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    ...result,
    audience,
  });
}
