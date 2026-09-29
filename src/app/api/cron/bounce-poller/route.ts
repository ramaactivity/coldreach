import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pollBouncesForAccount } from "@/lib/bounce-detector";

// Lowered from 60s default. With FETCH_CONCURRENCY=8 in bounce-detector,
// pulling 50 message bodies in parallel finishes in seconds rather than ~35s.
export const maxDuration = 60;

// Bounces are scanned via Gmail's `newer_than:7d` filter. Anything older
// won't show up — so don't bother polling accounts that haven't sent in
// the lookback window plus a small grace margin.
const ACTIVITY_LOOKBACK_DAYS = 14;

/**
 * Cron-triggered bounce poller. Runs every 30 min in production.
 * Scans each connected Gmail inbox for delivery-failure / DSN messages
 * and marks the matching campaign_recipients as bounced.
 *
 * Idle accounts (no last_used_at within ACTIVITY_LOOKBACK_DAYS) are skipped
 * entirely.
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

  const activityCutoff = new Date(
    Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 3600 * 1000,
  ).toISOString();

  const { data: accounts } = await admin
    .from("email_accounts")
    .select(
      "id, user_id, workspace_id, email, access_token_encrypted, refresh_token_encrypted, token_expires_at, provider, smtp_config, last_used_at",
    )
    .eq("is_active", true)
    .not("last_used_at", "is", null)
    .gte("last_used_at", activityCutoff);

  // Accounts are independent (own mailbox, own Gmail quota) — run them in
  // parallel. Sequentially, the last accounts were cut off by the function
  // timeout and never had their bounces recorded.
  // ?days=N widens the Gmail window once, to catch up after downtime.
  const days = Math.min(
    7,
    Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 2),
  );
  const results = await Promise.all(
    (accounts ?? []).map((account) =>
      pollBouncesForAccount(admin, account, days),
    ),
  );

  return NextResponse.json({
    ok: true,
    triggered_at: new Date().toISOString(),
    accounts_checked: results.length,
    total_bounces: results.reduce((sum, r) => sum + r.bounces_recorded, 0),
    results,
  });
}
