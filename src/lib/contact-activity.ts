import { createClient } from "@/lib/supabase/server";

export type TimelineEventType =
  | "sent"
  | "opened"
  | "replied"
  | "handled"
  | "followup_sent"
  | "stage_changed"
  | "test_sent";

export type TimelineEvent = {
  type: TimelineEventType;
  at: string; // ISO
  label: string;
  detail?: string | null;
  meta?: Record<string, unknown>;
};

type RecipientRow = {
  id: string;
  contact_email: string;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  handled_at: string | null;
  status: string;
  campaign:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
  template:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
};

type FollowupRow = {
  id: string;
  followup_step: number;
  sent_at: string | null;
  campaign_recipient_id: string;
  template:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
};

type ActivityRow = {
  id: string;
  activity_type: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

/**
 * Build a chronological event list for a contact within a workspace.
 * Sources merged: campaign_recipients (sent/opened/replied/handled),
 * followup_history (followup_sent), activity_log (stage_changed,
 * email_test_sent).
 */
export async function getContactTimeline(
  contactId: string,
  workspaceId: string,
): Promise<TimelineEvent[]> {
  const supabase = await createClient();

  const [recipientsRes, activityRes] = await Promise.all([
    supabase
      .from("campaign_recipients")
      .select(
        `id, contact_email, sent_at, opened_at, replied_at, handled_at, status,
         campaign:send_queues(id, name),
         template:templates(id, name)`,
      )
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId),
    supabase
      .from("activity_log")
      .select("id, activity_type, created_at, metadata")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "contact")
      .eq("entity_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const recipients = (recipientsRes.data ?? []) as unknown as RecipientRow[];
  const activities = (activityRes.data ?? []) as ActivityRow[];

  // Pull followups for these recipients
  let followups: FollowupRow[] = [];
  if (recipients.length > 0) {
    const recipientIds = recipients.map((r) => r.id);
    const { data: fuData } = await supabase
      .from("followup_history")
      .select(
        `id, followup_step, sent_at, campaign_recipient_id,
         template:templates(id, name)`,
      )
      .in("campaign_recipient_id", recipientIds);
    followups = (fuData ?? []) as unknown as FollowupRow[];
  }

  const events: TimelineEvent[] = [];

  for (const r of recipients) {
    const camp = unwrap(r.campaign);
    const tmpl = unwrap(r.template);
    const campaignLabel = camp?.name ?? "Manual send";
    const templateLabel = tmpl?.name;

    if (r.sent_at) {
      events.push({
        type: "sent",
        at: r.sent_at,
        label: `Email terkirim`,
        detail: templateLabel
          ? `${campaignLabel} · ${templateLabel}`
          : campaignLabel,
      });
    }
    if (r.opened_at) {
      events.push({
        type: "opened",
        at: r.opened_at,
        label: `Email dibuka`,
        detail: campaignLabel,
      });
    }
    if (r.replied_at) {
      events.push({
        type: "replied",
        at: r.replied_at,
        label: `Reply diterima`,
        detail: campaignLabel,
      });
    }
    if (r.handled_at) {
      events.push({
        type: "handled",
        at: r.handled_at,
        label: `Reply ditandai handled`,
        detail: campaignLabel,
      });
    }
  }

  for (const f of followups) {
    if (!f.sent_at) continue;
    const tmpl = unwrap(f.template);
    events.push({
      type: "followup_sent",
      at: f.sent_at,
      label: `Follow-up step ${f.followup_step}`,
      detail: tmpl?.name ?? null,
    });
  }

  for (const a of activities) {
    if (a.activity_type === "stage_changed") {
      const meta = a.metadata ?? {};
      const newStageName = (meta.new_stage_name as string | undefined) ?? null;
      events.push({
        type: "stage_changed",
        at: a.created_at,
        label: `Stage diubah`,
        detail: newStageName ? `→ ${newStageName}` : null,
      });
    } else if (a.activity_type === "email_test_sent") {
      events.push({
        type: "test_sent",
        at: a.created_at,
        label: `Email test dikirim`,
        detail: null,
      });
    }
    // email_sent is already covered by campaign_recipients above; skip dup
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events;
}
