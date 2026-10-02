import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A workspace may send from another workspace's connected account
 * (workspaces.sender_workspace_id — Hermes Sales borrows Tetraphoto's
 * mailbox). `accountWorkspaceId` is where the email_accounts row lives;
 * `sharingIds` = that workspace + every workspace borrowing its account, i.e.
 * everything whose sends share one quota counter and one inbox.
 */
export async function senderScope(
  admin: SupabaseClient,
  workspaceId: string,
): Promise<{ accountWorkspaceId: string; sharingIds: string[] }> {
  const { data: ws } = await admin
    .from("workspaces")
    .select("sender_workspace_id")
    .eq("id", workspaceId)
    .maybeSingle();
  const accountWorkspaceId =
    (ws?.sender_workspace_id as string | null | undefined) ?? workspaceId;
  const { data: borrowers } = await admin
    .from("workspaces")
    .select("id")
    .eq("sender_workspace_id", accountWorkspaceId);
  return {
    accountWorkspaceId,
    sharingIds: [accountWorkspaceId, ...(borrowers ?? []).map((b) => b.id as string)],
  };
}

/**
 * Max share of a shared account's daily quota a borrowing workspace may use
 * for NEW emails, so the owner's queue always keeps at least the other half
 * (Hermes Sales vs TETRA on ramadan@tetraphoto.com).
 * ponytail: per borrower — with two borrowers the shares would add up; split it then.
 */
export const BORROWER_QUOTA_SHARE = 0.5;

/** New emails a borrowing workspace may send per day on an account of `quota`. */
export function borrowerAllowance(cap: number | null | undefined, quota: number): number {
  return Math.min(cap ?? Infinity, Math.floor(quota * BORROWER_QUOTA_SHARE));
}

/**
 * Quota the account owner must leave for borrowing workspaces today: their
 * approved, sendable drafts up to each one's daily_new_cap. Zero when they
 * have nothing waiting, so the owner's queue can use the whole quota.
 */
export async function borrowerReserve(
  admin: SupabaseClient,
  borrowerIds: string[],
  dayStartIso: string,
  todayWib: string,
  quota: number,
): Promise<number> {
  const per = await Promise.all(
    borrowerIds.map(async (id) => {
      const [{ data: ws }, { count: sent }, { count: pending }] = await Promise.all([
        admin.from("workspaces").select("daily_new_cap").eq("id", id).maybeSingle(),
        admin
          .from("queue_recipients")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", id)
          .gte("sent_at", dayStartIso),
        admin
          .from("queue_recipients")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", id)
          .eq("status", "pending")
          .or(`scheduled_for_date.is.null,scheduled_for_date.lte.${todayWib}`),
      ]);
      const cap = ws?.daily_new_cap as number | null | undefined;
      const room = Math.max(0, borrowerAllowance(cap, quota) - (sent ?? 0));
      return Math.min(pending ?? 0, room);
    }),
  );
  return per.reduce((a, b) => a + b, 0);
}
