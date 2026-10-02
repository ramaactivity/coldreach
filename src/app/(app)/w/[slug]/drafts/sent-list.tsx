import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { displayCompany } from "@/lib/template-helpers";
import { addDaysWIB, todayWIB } from "@/lib/holidays-id";

const DAYS = 30;

const STATUS: Record<string, { label: string; variant: "neutral" | "success" | "danger" | "info" }> = {
  sent: { label: "Terkirim", variant: "neutral" },
  replied: { label: "Dibalas", variant: "success" },
  bounced: { label: "Bounce", variant: "danger" },
  unsubscribed: { label: "Berhenti langganan", variant: "danger" },
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Emails this workspace sent in the last 30 days, with the exact draft text. */
export async function SentList({ workspaceId }: { workspaceId: string }) {
  const supabase = await createClient();
  const since = `${addDaysWIB(todayWIB(), -DAYS)}T00:00:00+07:00`;
  const { data } = await supabase
    .from("queue_recipients")
    .select(
      "id, contact_id, status, sent_at, custom_subject, custom_body, campaign_recipient_id, contact:contacts!inner(email, company, status), campaign_recipient:campaign_recipients(gmail_subject_used)",
    )
    .eq("workspace_id", workspaceId)
    .not("custom_body", "is", null)
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    contact_id: string;
    status: string;
    sent_at: string;
    custom_subject: string | null;
    custom_body: string | null;
    campaign_recipient_id: string | null;
    contact: { email: string; company: string | null; status: string } | Array<{ email: string; company: string | null; status: string }>;
    campaign_recipient: { gmail_subject_used: string | null } | Array<{ gmail_subject_used: string | null }> | null;
  };
  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return null;

  // A reply can land on a follow-up's row, so read reply/bounce per contact,
  // and follow-up steps per original send.
  const crIds = rows.map((r) => r.campaign_recipient_id).filter((x): x is string => !!x);
  const [{ data: outcomes }, { data: followups }] = await Promise.all([
    supabase
      .from("campaign_recipients")
      .select("contact_id, status, replied_at, reply_snippet")
      .eq("workspace_id", workspaceId)
      .in("contact_id", rows.map((r) => r.contact_id))
      .in("status", ["replied", "bounced"]),
    crIds.length
      ? supabase
          .from("followup_history")
          .select("campaign_recipient_id, followup_step, sent_at")
          .in("campaign_recipient_id", crIds)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <section className="space-y-3">
      <h2 className="text-[13px] font-medium text-muted">
        Terkirim, {DAYS} hari terakhir ({rows.length})
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rows.map((r) => {
          const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
          const cr = Array.isArray(r.campaign_recipient) ? r.campaign_recipient[0] : r.campaign_recipient;
          const mine = (outcomes ?? []).filter((o) => o.contact_id === r.contact_id);
          const status = mine.some((o) => o.status === "replied")
            ? "replied"
            : mine.some((o) => o.status === "bounced") || r.status === "bounced"
              ? "bounced"
              : c?.status === "unsubscribed"
                ? "unsubscribed"
                : "sent";
          const fu = (followups ?? [])
            .filter((f) => f.campaign_recipient_id === r.campaign_recipient_id)
            .sort((a, b) => a.followup_step - b.followup_step);
          const s = STATUS[status];
          const reply = mine.find((o) => o.status === "replied");
          return (
            <details key={r.id} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {displayCompany(c?.company) || c?.email}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {c?.email} · {cr?.gmail_subject_used ?? r.custom_subject}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[12px] text-muted">
                  {fu.length > 0 && <span>Follow-up {fu.length}×</span>}
                  <span className="tabular-nums">{fmt(r.sent_at)}</span>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
              </summary>
              <div className="mt-3 rounded-md bg-surface-sunken p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{r.custom_body}</p>
                {reply?.reply_snippet && (
                  <div className="mt-4 border-l-2 border-success pl-3">
                    <p className="text-[12px] font-medium text-success-text">
                      Balasan · {fmt(reply.replied_at)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{reply.reply_snippet}</p>
                  </div>
                )}
                {fu.length > 0 && (
                  <p className="mt-3 text-[12px] text-muted">
                    {fu.map((f) => `Follow-up ${f.followup_step}: ${fmt(f.sent_at)}`).join(" · ")}
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
