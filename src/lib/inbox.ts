import { createClient } from "@/lib/supabase/server";

export type InboxTab = "pending" | "snoozed" | "handled";

export type InboxItem = {
  id: string; // campaign_recipient id
  contact_id: string;
  contact_email: string;
  contact_name: string | null;
  contact_company: string | null;
  contact_position: string | null;
  gmail_thread_id: string | null;
  sent_at: string | null;
  replied_at: string;
  handled_at: string | null;
  snoozed_until: string | null;
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  workspace_color: string;
  lead_stage_id: string | null;
  reply_classification: string | null;
  reply_snippet: string | null;
};

// Pending tab order: hottest first, then newest. A reply that says
// "interested" must never sit below an out-of-office.
const HEAT: Record<string, number> = {
  interested: 0,
  question: 1,
  other: 2,
  out_of_office: 3,
  not_interested: 4,
  unsubscribe_request: 5,
};
const heat = (c: string | null) => HEAT[c ?? "other"] ?? 2;

export type InboxCounts = {
  pending: number;
  snoozed: number;
  handled: number;
};

type RawRow = {
  id: string;
  contact_id: string;
  contact_email: string;
  gmail_thread_id: string | null;
  sent_at: string | null;
  replied_at: string;
  handled_at: string | null;
  snoozed_until: string | null;
  workspace_id: string;
  reply_classification: string | null;
  reply_snippet: string | null;
  contact:
    | {
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        position: string | null;
      }
    | Array<{
        first_name: string | null;
        last_name: string | null;
        company: string | null;
        position: string | null;
      }>
    | null;
  workspace:
    | { name: string; slug: string; color_theme: string }
    | Array<{ name: string; slug: string; color_theme: string }>
    | null;
  contact_workspace_data:
    | { lead_stage_id: string | null }
    | Array<{ lead_stage_id: string | null }>
    | null;
};

function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function fullName(c: { first_name: string | null; last_name: string | null } | null): string | null {
  if (!c) return null;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || null;
}

const SELECT_COLS = `id, contact_id, contact_email, gmail_thread_id, sent_at, replied_at,
   handled_at, snoozed_until, workspace_id, reply_classification, reply_snippet,
   contact:contacts(first_name, last_name, company, position),
   workspace:workspaces(name, slug, color_theme)`;

/**
 * Fetch inbox rows for a workspace (or all workspaces when workspaceId=null).
 * Filtered by tab: pending (default), snoozed, or handled.
 */
export async function getInboxReplies(
  workspaceId: string | null,
  tab: InboxTab = "pending",
  limit = 100,
): Promise<InboxItem[]> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // Build the query in one expression per branch to avoid Supabase's
  // chained-builder type-depth blowup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from("campaign_recipients")
    .select(SELECT_COLS)
    .eq("status", "replied")
    .not("replied_at", "is", null);

  if (workspaceId) q = q.eq("workspace_id", workspaceId);

  if (tab === "pending") {
    q = q
      .is("handled_at", null)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
      .order("replied_at", { ascending: false });
  } else if (tab === "snoozed") {
    q = q
      .is("handled_at", null)
      .gt("snoozed_until", nowIso)
      .order("snoozed_until", { ascending: true });
  } else {
    q = q
      .not("handled_at", "is", null)
      .order("handled_at", { ascending: false });
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    console.error("getInboxReplies error:", error);
    return [];
  }

  const rows = (data ?? []) as unknown as RawRow[];
  if (rows.length === 0) return [];

  // Pull workspace data (stage) per (contact_id, workspace_id) in a 2nd query
  const pairs = rows.map((r) => ({
    contact_id: r.contact_id,
    workspace_id: r.workspace_id,
  }));
  const { data: cwdRows } = await supabase
    .from("contact_workspace_data")
    .select("contact_id, workspace_id, lead_stage_id")
    .in(
      "contact_id",
      pairs.map((p) => p.contact_id),
    );

  const stageMap = new Map<string, string | null>();
  for (const cwd of (cwdRows ?? []) as Array<{
    contact_id: string;
    workspace_id: string;
    lead_stage_id: string | null;
  }>) {
    stageMap.set(`${cwd.contact_id}:${cwd.workspace_id}`, cwd.lead_stage_id);
  }

  const items = rows.map((r) => {
    const c = unwrap(r.contact);
    const w = unwrap(r.workspace);
    return {
      id: r.id,
      contact_id: r.contact_id,
      contact_email: r.contact_email,
      contact_name: fullName(c),
      contact_company: c?.company ?? null,
      contact_position: c?.position ?? null,
      gmail_thread_id: r.gmail_thread_id,
      sent_at: r.sent_at,
      replied_at: r.replied_at,
      handled_at: r.handled_at,
      snoozed_until: r.snoozed_until,
      workspace_id: r.workspace_id,
      workspace_name: w?.name ?? "",
      workspace_slug: w?.slug ?? "",
      workspace_color: w?.color_theme ?? "#71717a",
      lead_stage_id:
        stageMap.get(`${r.contact_id}:${r.workspace_id}`) ?? null,
      reply_classification: r.reply_classification,
      reply_snippet: r.reply_snippet,
    };
  });
  if (tab === "pending") {
    items.sort(
      (a, b) =>
        heat(a.reply_classification) - heat(b.reply_classification) ||
        Date.parse(b.replied_at) - Date.parse(a.replied_at),
    );
  }
  return items;
}

/**
 * Counts for the three inbox tabs. Used to render tab badges.
 */
export async function getInboxCounts(
  workspaceId: string | null,
): Promise<InboxCounts> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const base = (): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("status", "replied")
      .not("replied_at", "is", null);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    return q;
  };

  const [pendingRes, snoozedRes, handledRes] = await Promise.all([
    base()
      .is("handled_at", null)
      .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`),
    base().is("handled_at", null).gt("snoozed_until", nowIso),
    base().not("handled_at", "is", null),
  ]);

  return {
    pending: pendingRes.count ?? 0,
    snoozed: snoozedRes.count ?? 0,
    handled: handledRes.count ?? 0,
  };
}
