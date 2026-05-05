import { createClient } from "@/lib/supabase/server";
import type { Workspace } from "@/lib/workspace-constants";

export type Contact = {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
  phone: string | null;
  website: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  tags: string[];
  status: "active" | "unsubscribed" | "blocked" | "bounced";
  source: string | null;
  priority: "low" | "medium" | "high";
  total_emails_sent_all_workspaces: number;
  last_contacted_at_any: string | null;
  unsubscribe_token: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ContactWithWorkspaceData = Contact & {
  workspace_data?: {
    lead_stage_id: string | null;
    workspace_notes: string | null;
    total_emails_sent: number;
    total_emails_opened: number;
    total_replies: number;
    last_contacted_at: string | null;
    is_excluded: boolean;
  } | null;
};

export type ContactsFilter = {
  search?: string;
  tags?: string[];
  status?: Contact["status"];
  priority?: Contact["priority"];
  lead_stage_id?: string;
  has_replied?: boolean;
  never_contacted?: boolean;
};

export type ContactsListResult = {
  contacts: ContactWithWorkspaceData[];
  total: number;
};

export async function listContacts(
  workspace: Workspace,
  filter: ContactsFilter = {},
  page = 0,
  pageSize = 50,
): Promise<ContactsListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select(
      `
      id, user_id, email, first_name, last_name, company, position,
      phone, website, notes, custom_fields, tags, status, source, priority,
      total_emails_sent_all_workspaces, last_contacted_at_any,
      unsubscribe_token, created_at, updated_at, deleted_at,
      workspace_data:contact_workspace_data!left(
        lead_stage_id, workspace_notes, total_emails_sent,
        total_emails_opened, total_replies, last_contacted_at, is_excluded
      )
    `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .eq("contact_workspace_data.workspace_id", workspace.id);

  if (filter.search) {
    const term = filter.search.trim();
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }
  if (filter.tags && filter.tags.length > 0) {
    query = query.contains("tags", filter.tags);
  }
  if (filter.status) {
    query = query.eq("status", filter.status);
  }
  if (filter.priority) {
    query = query.eq("priority", filter.priority);
  }

  query = query
    .order("created_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, count, error } = await query;

  if (error) {
    console.error("listContacts error:", error);
    return { contacts: [], total: 0 };
  }

  // Supabase returns workspace_data as an array (because of the !left join);
  // flatten to a single object or null.
  const contacts = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    workspace_data: Array.isArray(c.workspace_data)
      ? (c.workspace_data[0] ?? null)
      : (c.workspace_data ?? null),
  })) as ContactWithWorkspaceData[];

  return { contacts, total: count ?? 0 };
}

export async function getContactById(
  id: string,
): Promise<Contact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("getContactById error:", error);
    return null;
  }
  return (data as Contact) ?? null;
}

export async function getContactCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (error) {
    console.error("getContactCount error:", error);
    return 0;
  }
  return count ?? 0;
}
