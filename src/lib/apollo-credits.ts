import type { SupabaseClient } from "@supabase/supabase-js";

// Apollo credit estimate. Apollo's live balance isn't exposed via API, so we
// estimate: start from the monthly limit (or a manual sync baseline) and
// subtract credits spent via ColdReach (logged to activity_log on every
// reveal). The number is clearly labelled an estimate in the UI.

const WIB_OFFSET_MS = 7 * 3600 * 1000;

export type ApolloCreditStatus = {
  limit: number;
  usedThisCycle: number;
  remainingEst: number;
  resetDay: number;
  cycleStartIso: string;
  nextResetIso: string; // YYYY-MM-DD (WIB)
  daysToReset: number;
  /** Still a meaningful chunk unused AND reset is near → nudge to use it. */
  unusedHint: boolean;
  isEstimate: boolean;
};

function clampDay(d: number): number {
  if (!Number.isFinite(d)) return 1;
  return Math.min(28, Math.max(1, Math.floor(d)));
}

// UTC instant for 00:00 WIB on the given WIB calendar day.
function wibMidnightUtc(y: number, m0: number, day: number): number {
  return Date.UTC(y, m0, day) - WIB_OFFSET_MS;
}

export async function getApolloCreditStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<ApolloCreditStatus> {
  const { data: u } = await supabase
    .from("users")
    .select(
      "apollo_credit_limit, apollo_cycle_reset_day, apollo_credits_synced_remaining, apollo_credits_synced_at",
    )
    .eq("id", userId)
    .maybeSingle();

  const limit = (u as { apollo_credit_limit?: number } | null)
    ?.apollo_credit_limit ?? 2560;
  const resetDay = clampDay(
    (u as { apollo_cycle_reset_day?: number } | null)?.apollo_cycle_reset_day ??
      1,
  );
  const syncedRemaining = (
    u as { apollo_credits_synced_remaining?: number | null } | null
  )?.apollo_credits_synced_remaining;
  const syncedAt = (u as { apollo_credits_synced_at?: string | null } | null)
    ?.apollo_credits_synced_at;

  // WIB "now" for cycle math.
  const wibNow = new Date(Date.now() + WIB_OFFSET_MS);
  const y = wibNow.getUTCFullYear();
  const m0 = wibNow.getUTCMonth();
  const d = wibNow.getUTCDate();

  // Cycle start = most recent resetDay (this month if we're past it, else
  // previous month).
  const cycleStartMs =
    d >= resetDay
      ? wibMidnightUtc(y, m0, resetDay)
      : wibMidnightUtc(y, m0 - 1, resetDay);
  // Next reset = following month's resetDay.
  const nextResetMs =
    d >= resetDay
      ? wibMidnightUtc(y, m0 + 1, resetDay)
      : wibMidnightUtc(y, m0, resetDay);

  // Baseline: prefer a manual sync done within this cycle.
  let baseRemaining = limit;
  let spendSinceMs = cycleStartMs;
  if (
    typeof syncedRemaining === "number" &&
    syncedAt &&
    new Date(syncedAt).getTime() >= cycleStartMs
  ) {
    baseRemaining = syncedRemaining;
    spendSinceMs = new Date(syncedAt).getTime();
  }

  // Sum credits spent via ColdReach since the baseline point.
  let spent = 0;
  try {
    const { data: rows } = await supabase
      .from("activity_log")
      .select("metadata, created_at")
      .eq("user_id", userId)
      .eq("activity_type", "apollo_credits_used")
      .gte("created_at", new Date(spendSinceMs).toISOString());
    for (const r of rows ?? []) {
      const c = (r as { metadata?: { count?: unknown } | null }).metadata
        ?.count;
      const n = typeof c === "number" ? c : Number(c);
      if (Number.isFinite(n) && n > 0) spent += n;
    }
  } catch {
    // Non-fatal — show base estimate.
  }

  const remainingEst = Math.max(0, baseRemaining - spent);
  const usedThisCycle = Math.max(0, limit - remainingEst);
  const daysToReset = Math.max(
    0,
    Math.ceil((nextResetMs - Date.now()) / (24 * 3600 * 1000)),
  );

  return {
    limit,
    usedThisCycle,
    remainingEst,
    resetDay,
    cycleStartIso: new Date(cycleStartMs).toISOString(),
    nextResetIso: new Date(nextResetMs + WIB_OFFSET_MS)
      .toISOString()
      .slice(0, 10),
    daysToReset,
    unusedHint: remainingEst > limit * 0.25 && daysToReset <= 7,
    isEstimate: true,
  };
}
