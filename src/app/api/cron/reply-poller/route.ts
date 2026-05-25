import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollRepliesForAccount } from "@/lib/reply-detector";

// Lower than the implicit 60s default so Provisioned Memory budget reflects
// the real worst case. With CONCURRENCY=8 in reply-detector, 100 candidates
// take ~5–10s rather than ~50s sequential. 30s is a generous ceiling.
export const maxDuration = 30;

// Replies only matter for accounts that have actually sent something in the
// reply-detection lookback window. Anything older won't be polled by the
// detector anyway. Matches REPLY_LOOKBACK_DAYS in lib/reply-detector.ts.
const ACTIVITY_LOOKBACK_DAYS = 30;

/**
 * Cron-triggered reply poller. Runs every 30 min in production.
 * For each active email_account that has actually been used recently,
 * checks Gmail threads of recent sent campaign_recipients and marks replies.
 *
 * Accounts that haven't sent anything in ACTIVITY_LOOKBACK_DAYS are skipped
 * entirely — no Gmail client, no token decrypt, no DB candidate query —
 * which is the cheapest possible no-op when the cron fires on an idle
 * workspace.
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

  const activityCutoff = new Date(
    Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  // Filter on last_used_at at the DB level so idle accounts never enter the
  // poll loop. NULL last_used_at means the account has never sent — skip too.
  const { data: accounts } = await admin
    .from("email_accounts")
    .select(
      "id, user_id, email, access_token_encrypted, refresh_token_encrypted, token_expires_at, last_used_at",
    )
    .eq("is_active", true)
    .not("last_used_at", "is", null)
    .gte("last_used_at", activityCutoff);

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
  });
}
