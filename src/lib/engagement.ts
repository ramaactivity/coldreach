import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recomputes contacts.engagement_score from current aggregates. Same
 * formula the migration backfill uses.
 *
 * Score is bounded [0, 100]:
 *   - 1 point per open, capped at 20
 *   - 15 points per reply
 *   - +25 if engaged in last 14d
 *   - +10 if engaged in last 60d (and not in the 14d bucket)
 */
export function computeEngagementScore(
  totalOpens: number,
  totalReplies: number,
  lastEngagedAt: Date | string | null,
): number {
  const opens = Math.max(0, Math.min(totalOpens, 20));
  const reply = Math.max(0, totalReplies) * 15;

  let recency = 0;
  if (lastEngagedAt) {
    const ms =
      typeof lastEngagedAt === "string"
        ? Date.parse(lastEngagedAt)
        : lastEngagedAt.getTime();
    const diffDays = (Date.now() - ms) / (24 * 3600 * 1000);
    if (diffDays <= 14) recency = 25;
    else if (diffDays <= 60) recency = 10;
  }

  return Math.min(100, opens + reply + recency);
}

/**
 * Bumps contact engagement aggregates after a tracking event and recomputes
 * the score atomically. Used by the open-tracking pixel + reply-detector.
 *
 * `kind`:
 *   - 'open' — increments opens counter (cap on cumulative score is in
 *     computeEngagementScore so callers can call this on every open).
 *   - 'reply' — increments replies counter.
 */
export async function bumpContactEngagement(
  admin: SupabaseClient,
  contactId: string,
  kind: "open" | "reply",
): Promise<void> {
  const { data: row } = await admin
    .from("contacts")
    .select(
      "total_opens_all_workspaces, total_replies_all_workspaces, last_engaged_at",
    )
    .eq("id", contactId)
    .maybeSingle();

  if (!row) return;
  const r = row as {
    total_opens_all_workspaces: number;
    total_replies_all_workspaces: number;
    last_engaged_at: string | null;
  };

  const nowIso = new Date().toISOString();
  const nextOpens =
    kind === "open"
      ? (r.total_opens_all_workspaces ?? 0) + 1
      : r.total_opens_all_workspaces;
  const nextReplies =
    kind === "reply"
      ? (r.total_replies_all_workspaces ?? 0) + 1
      : r.total_replies_all_workspaces;

  const nextScore = computeEngagementScore(nextOpens, nextReplies, nowIso);

  await admin
    .from("contacts")
    .update({
      total_opens_all_workspaces: nextOpens,
      total_replies_all_workspaces: nextReplies,
      last_engaged_at: nowIso,
      engagement_score: nextScore,
    })
    .eq("id", contactId);
}
