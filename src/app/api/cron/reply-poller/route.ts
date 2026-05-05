import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollRepliesForAccount } from "@/lib/reply-detector";

/**
 * Cron-triggered reply poller. Runs every 15 min in production.
 * For each active email_account, checks Gmail threads of recent sent
 * campaign_recipients and marks replies.
 *
 * Auth: X-Cron-Secret header must match CRON_SECRET env.
 *
 * Manual trigger:
 *   curl -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/reply-poller
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
    const r = await pollRepliesForAccount(admin, account);
    results.push(r);
  }

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    accounts_checked: results.length,
    total_replies: results.reduce((sum, r) => sum + r.replies_found, 0),
    results,
  });
}
