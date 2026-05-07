import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollBouncesForAccount } from "@/lib/bounce-detector";

export const maxDuration = 60;

/**
 * Cron-triggered bounce poller. Runs every 30 min in production.
 * Scans each connected Gmail inbox for delivery-failure / DSN messages
 * and marks the matching campaign_recipients as bounced.
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env.
 *
 * Manual:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/bounce-poller
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from("email_accounts")
    .select(
      "id, user_id, email, access_token_encrypted, refresh_token_encrypted, token_expires_at",
    )
    .eq("is_active", true);

  const results = [];
  for (const account of accounts ?? []) {
    const r = await pollBouncesForAccount(admin, account);
    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    accounts_checked: results.length,
    total_bounces: results.reduce((sum, r) => sum + r.bounces_recorded, 0),
    results,
  });
}
