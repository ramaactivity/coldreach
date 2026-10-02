import Link from "next/link";
import { notFound } from "next/navigation";
import { Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { addDaysWIB, todayWIB } from "@/lib/holidays-id";
import { displayCompany, displayPersonName, renderPreview } from "@/lib/template-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DAYS = 30;
const PAGE_SIZE = 50;

const TABS = [
  { value: "", label: "Semua", statuses: ["sent", "replied", "bounced"] },
  { value: "replied", label: "Dibalas", statuses: ["replied"] },
  { value: "bounced", label: "Bounce", statuses: ["bounced"] },
] as const;

const STATUS: Record<string, { label: string; variant: "neutral" | "success" | "danger" }> = {
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

type Contact = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  position: string | null;
  status: string;
  language_pref: string | null;
};
type Row = {
  id: string;
  contact_id: string;
  status: string;
  sent_at: string;
  template_id: string | null;
  custom_subject: string | null;
  custom_body: string | null;
  campaign_recipient_id: string | null;
  contact: Contact | Contact[];
  campaign_recipient: { gmail_subject_used: string | null } | Array<{ gmail_subject_used: string | null }> | null;
};
type Template = { id: string; name: string; body_plain: string; body_plain_en: string | null };

/** Template text with the contact's values — what sendEmail rendered (minus any AI opener). */
function renderTemplate(t: Template, c: Contact): string {
  const first = displayPersonName(c.first_name);
  const last = displayPersonName(c.last_name);
  const body = c.language_pref === "en" && t.body_plain_en ? t.body_plain_en : t.body_plain;
  return renderPreview(body, {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" "),
    email: c.email,
    company: displayCompany(c.company),
    position: c.position ?? "",
    ai_opener: "",
  });
}

export default async function SentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const tab = TABS.find((t) => t.value === (sp.status ?? "")) ?? TABS[0];
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const since = `${addDaysWIB(todayWIB(), -DAYS)}T00:00:00+07:00`;

  const supabase = await createClient();
  const { data, count } = await supabase
    .from("queue_recipients")
    .select(
      "id, contact_id, status, sent_at, template_id, custom_subject, custom_body, campaign_recipient_id, contact:contacts!inner(email, first_name, last_name, company, position, status, language_pref), campaign_recipient:campaign_recipients(gmail_subject_used)",
      { count: "exact" },
    )
    .eq("workspace_id", workspace.id)
    .in("status", [...tab.statuses])
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Row[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  // A reply can land on a follow-up's row, so read reply/bounce per contact,
  // and follow-up steps per original send.
  const crIds = rows.map((r) => r.campaign_recipient_id).filter((x): x is string => !!x);
  const templateIds = Array.from(new Set(rows.map((r) => r.template_id).filter((x): x is string => !!x)));
  const contactIds = rows.map((r) => r.contact_id);
  const [{ data: outcomes }, { data: followups }, { data: templates }] = await Promise.all([
    contactIds.length
      ? supabase
          .from("campaign_recipients")
          .select("contact_id, status, replied_at, reply_snippet")
          .eq("workspace_id", workspace.id)
          .in("contact_id", contactIds)
          .in("status", ["replied", "bounced"])
      : Promise.resolve({ data: [] }),
    crIds.length
      ? supabase
          .from("followup_history")
          .select("campaign_recipient_id, followup_step, sent_at")
          .in("campaign_recipient_id", crIds)
      : Promise.resolve({ data: [] }),
    templateIds.length
      ? supabase.from("templates").select("id, name, body_plain, body_plain_en").in("id", templateIds)
      : Promise.resolve({ data: [] }),
  ]);
  const templateById = new Map(((templates ?? []) as Template[]).map((t) => [t.id, t]));

  const href = (status: string, p: number) => {
    const q = new URLSearchParams();
    if (status) q.set("status", status);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/w/${slug}/sent${s ? `?${s}` : ""}`;
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-8">
      <PageHeader
        title="Terkirim"
        description={`Email pertama yang dikirim workspace ini dalam ${DAYS} hari terakhir, dengan follow-up, status, dan isi balasannya.`}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav className="inline-flex h-9 items-center gap-0.5 rounded-md bg-surface-sunken p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.value}
              href={href(t.value, 1)}
              className={cn(
                "inline-flex h-8 items-center rounded-[6px] px-3 text-sm font-medium transition-colors",
                t.value === tab.value
                  ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <p className="text-[13px] text-muted tabular-nums">{count ?? 0} email</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Belum ada email di sini"
          description="Email yang terkirim dalam 30 hari terakhir muncul di halaman ini."
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {rows.map((r) => {
            const c = Array.isArray(r.contact) ? r.contact[0] : r.contact;
            const cr = Array.isArray(r.campaign_recipient) ? r.campaign_recipient[0] : r.campaign_recipient;
            const mine = (outcomes ?? []).filter((o) => o.contact_id === r.contact_id);
            const reply = mine.find((o) => o.status === "replied");
            const status = reply
              ? "replied"
              : mine.some((o) => o.status === "bounced") || r.status === "bounced"
                ? "bounced"
                : c?.status === "unsubscribed"
                  ? "unsubscribed"
                  : "sent";
            const fu = (followups ?? [])
              .filter((f) => f.campaign_recipient_id === r.campaign_recipient_id)
              .sort((a, b) => a.followup_step - b.followup_step);
            const template = r.template_id ? templateById.get(r.template_id) : undefined;
            const body = r.custom_body ?? (template && c ? renderTemplate(template, c) : null);
            const s = STATUS[status];
            return (
              <details key={r.id} className="px-5 py-4">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {displayCompany(c?.company) || c?.email}
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-muted">
                      {c?.email} · {cr?.gmail_subject_used ?? r.custom_subject ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-[12px] text-muted">
                    {fu.length > 0 && <span>Follow-up {fu.length}×</span>}
                    <span className="tabular-nums">{fmt(r.sent_at)}</span>
                    <Badge variant={s.variant}>{s.label}</Badge>
                  </div>
                </summary>
                <div className="mt-3 rounded-md bg-surface-sunken p-4">
                  <p className="mb-2 text-[12px] text-muted">
                    {r.custom_body
                      ? "Draf personal (Hermes), persis seperti dikirim"
                      : template
                        ? `Template: ${template.name}`
                        : "Template tidak tercatat"}
                  </p>
                  {body && (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">{body}</p>
                  )}
                  {reply && (
                    <div className="mt-4 border-l-2 border-success pl-3">
                      <p className="text-[12px] font-medium text-success-text">
                        Balasan{reply.replied_at ? ` · ${fmt(reply.replied_at)}` : ""}
                      </p>
                      {reply.reply_snippet && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                          {reply.reply_snippet}
                        </p>
                      )}
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
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-muted">
          {page > 1 ? (
            <Link href={href(tab.value, page - 1)} className="hover:text-ink">
              ← Sebelumnya
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums">
            Halaman {page} dari {pages}
          </span>
          {page < pages ? (
            <Link href={href(tab.value, page + 1)} className="hover:text-ink">
              Berikutnya →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
