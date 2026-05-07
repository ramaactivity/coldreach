import { createClient } from "@/lib/supabase/server";

export type WorkspaceStats = {
  contacts_total: number;
  templates_total: number;
  queues_active: number;
  sent_today: number;
  sent_7d: number;
  opened_7d: number;
  replied_7d: number;
  pending_replies: number; // replied but not yet handled
  bounced_7d: number;
  skipped_total: number;
  quota_today: { sent: number; quota: number } | null;
};

export type RecentActivity = {
  id: string;
  activity_type: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  workspace_id: string | null;
  workspace_name?: string;
};

export type RecentReply = {
  id: string;
  contact_email: string;
  contact_name: string | null;
  contact_company: string | null;
  gmail_thread_id: string | null;
  replied_at: string;
  workspace_id: string;
  workspace_name?: string;
};

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

export async function getWorkspaceStats(
  workspaceId: string,
): Promise<WorkspaceStats> {
  const supabase = await createClient();
  const weekAgo = daysAgoIso(7);

  const [
    contactsCount,
    templatesCount,
    activeQueuesCount,
    sent7dCount,
    opened7dCount,
    replied7dCount,
    pendingRepliesCount,
    bounced7dCount,
    skippedTotalCount,
    accountInfo,
  ] = await Promise.all([
    supabase
      .from("contact_workspace_data")
      .select("contact_id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("templates")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("send_queues")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("is_active", true),
    // Use created_at + include 'sending' so we still count rows whose
    // post-send DB update never finished (e.g., function timeout). The
    // email actually went out via Gmail in those cases.
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", weekAgo)
      .in("status", ["sending", "sent", "opened", "replied"]),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("opened_at", weekAgo),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("replied_at", weekAgo),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "replied")
      .is("handled_at", null),
    supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", weekAgo)
      .eq("status", "bounced"),
    supabase
      .from("queue_recipients")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "skipped"),
    supabase
      .from("email_accounts")
      .select("daily_quota, emails_sent_today")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  // sent_today is sourced from email_accounts.emails_sent_today so it stays
  // in sync with the per-account quota counter the queue-runner writes
  // directly. campaign_recipients-based counts could undercount when
  // post-send DB writes lag (or be misaligned by RLS/cache).
  const sentToday = accountInfo.data
    ? (accountInfo.data as { emails_sent_today: number }).emails_sent_today
    : 0;

  return {
    contacts_total: contactsCount.count ?? 0,
    templates_total: templatesCount.count ?? 0,
    queues_active: activeQueuesCount.count ?? 0,
    sent_today: sentToday,
    sent_7d: sent7dCount.count ?? 0,
    opened_7d: opened7dCount.count ?? 0,
    replied_7d: replied7dCount.count ?? 0,
    pending_replies: pendingRepliesCount.count ?? 0,
    bounced_7d: bounced7dCount.count ?? 0,
    skipped_total: skippedTotalCount.count ?? 0,
    quota_today: accountInfo.data
      ? {
          sent: (accountInfo.data as { emails_sent_today: number }).emails_sent_today,
          quota: (accountInfo.data as { daily_quota: number }).daily_quota,
        }
      : null,
  };
}

export async function getRecentReplies(
  workspaceId: string | null = null,
  limit = 10,
): Promise<RecentReply[]> {
  const supabase = await createClient();

  let query = supabase
    .from("campaign_recipients")
    .select(
      `id, contact_email, gmail_thread_id, replied_at, workspace_id,
       contact:contacts(first_name, last_name, company),
       workspace:workspaces(name)`,
    )
    .eq("status", "replied")
    .not("replied_at", "is", null)
    .order("replied_at", { ascending: false })
    .limit(limit);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data } = await query;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const contact = row.contact as
      | { first_name: string | null; last_name: string | null; company: string | null }
      | Array<{ first_name: string | null; last_name: string | null; company: string | null }>
      | null;
    const c = Array.isArray(contact) ? contact[0] : contact;
    const ws = row.workspace as { name: string } | Array<{ name: string }> | null;
    const w = Array.isArray(ws) ? ws[0] : ws;
    const fullName = c
      ? [c.first_name, c.last_name].filter(Boolean).join(" ") || null
      : null;
    return {
      id: row.id as string,
      contact_email: row.contact_email as string,
      contact_name: fullName,
      contact_company: c?.company ?? null,
      gmail_thread_id: row.gmail_thread_id as string | null,
      replied_at: row.replied_at as string,
      workspace_id: row.workspace_id as string,
      workspace_name: w?.name,
    };
  });
}

export async function getRecentActivity(
  workspaceId: string | null = null,
  limit = 20,
): Promise<RecentActivity[]> {
  const supabase = await createClient();

  let query = supabase
    .from("activity_log")
    .select(
      `id, activity_type, entity_type, entity_id, metadata, created_at, workspace_id,
       workspace:workspaces(name)`,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data } = await query;

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const ws = row.workspace as { name: string } | Array<{ name: string }> | null;
    const w = Array.isArray(ws) ? ws[0] : ws;
    return {
      id: row.id as string,
      activity_type: row.activity_type as string,
      entity_type: row.entity_type as string | null,
      entity_id: row.entity_id as string | null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      created_at: row.created_at as string,
      workspace_id: row.workspace_id as string | null,
      workspace_name: w?.name,
    };
  });
}
