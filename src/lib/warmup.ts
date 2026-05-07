// Domain warmup — gradually increases the per-account effective daily
// cap during the first 30 days of an account. Reputation lifts with
// consistent volume; a brand-new Gmail blasting 90/day looks like a
// spammer and lands in spam folders. The schedule below is conservative:
//
//   day 1-3   →  20/day
//   day 4-7   →  40/day
//   day 8-14  →  60/day
//   day 15-30 →  80/day
//   day 31+   →  account's normal daily_quota (typically 90 for free Gmail)
//
// When warmup_mode = true on email_accounts, queue-runner caps batch size
// at this value. When the user clears warmup_mode (or warmup_started_at
// is null) we use the full quota — so the toggle is the off-switch.

const STAGES: ReadonlyArray<{ throughDay: number; cap: number }> = [
  { throughDay: 3, cap: 20 },
  { throughDay: 7, cap: 40 },
  { throughDay: 14, cap: 60 },
  { throughDay: 30, cap: 80 },
];

/**
 * Returns the effective per-day cap for an account given its warmup state.
 * Caller compares this against the workspace's daily_target to pick the
 * smaller value as the actual batch ceiling for the day.
 */
export function effectiveWarmupQuota(opts: {
  warmupMode: boolean;
  warmupStartedAt: string | Date | null;
  fallbackQuota: number;
}): number {
  if (!opts.warmupMode || !opts.warmupStartedAt) return opts.fallbackQuota;

  const startMs =
    typeof opts.warmupStartedAt === "string"
      ? Date.parse(opts.warmupStartedAt)
      : opts.warmupStartedAt.getTime();
  if (Number.isNaN(startMs)) return opts.fallbackQuota;

  const dayInWarmup = Math.max(
    1,
    Math.floor((Date.now() - startMs) / (24 * 3600 * 1000)) + 1,
  );

  for (const stage of STAGES) {
    if (dayInWarmup <= stage.throughDay) {
      return Math.min(stage.cap, opts.fallbackQuota);
    }
  }
  // Past the warmup ramp — fall through to full quota.
  return opts.fallbackQuota;
}

/** Used by UI to surface the current cap so the user knows what's limiting them. */
export function describeWarmupStage(opts: {
  warmupMode: boolean;
  warmupStartedAt: string | Date | null;
  fallbackQuota: number;
}): { day: number; cap: number; isCapped: boolean } | null {
  if (!opts.warmupMode || !opts.warmupStartedAt) return null;
  const startMs =
    typeof opts.warmupStartedAt === "string"
      ? Date.parse(opts.warmupStartedAt)
      : opts.warmupStartedAt.getTime();
  if (Number.isNaN(startMs)) return null;
  const day = Math.max(
    1,
    Math.floor((Date.now() - startMs) / (24 * 3600 * 1000)) + 1,
  );
  const cap = effectiveWarmupQuota(opts);
  return { day, cap, isCapped: cap < opts.fallbackQuota };
}
