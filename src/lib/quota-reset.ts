import type { SupabaseClient } from "@supabase/supabase-js";

// All business logic uses Asia/Jakarta (WIB, UTC+7) — schedules, holidays,
// daily quota windows. "Today" for quota purposes is the WIB calendar day.
const WIB_OFFSET_MS = 7 * 3600 * 1000;

export function startOfTodayWibIso(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - WIB_OFFSET_MS).toISOString();
}

type AccountForReset = {
  id: string;
  emails_sent_today: number;
  quota_reset_at: string | null;
};

/**
 * Lazy daily-quota reset. The pg_cron job at 00:00 WIB is best-effort —
 * if it didn't fire (extension disabled, schedule never created, downtime),
 * the counter would stay stale and either block sends or report wrong
 * stats. Call this immediately after fetching the account row.
 *
 * Returns the effective `emails_sent_today` value to use for the rest of
 * the request. Mutates DB only when a reset is actually needed.
 */
export async function ensureDailyQuotaFresh(
  admin: SupabaseClient,
  account: AccountForReset,
): Promise<number> {
  const dayStart = startOfTodayWibIso();
  const lastReset = account.quota_reset_at;
  if (lastReset && lastReset >= dayStart) {
    return account.emails_sent_today;
  }
  await admin
    .from("email_accounts")
    .update({
      emails_sent_today: 0,
      quota_reset_at: new Date().toISOString(),
    })
    .eq("id", account.id);
  return 0;
}
