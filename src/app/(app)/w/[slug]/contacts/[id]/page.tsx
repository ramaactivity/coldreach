import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Building2,
  Archive,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getContactById } from "@/lib/contacts";
import { listTemplates } from "@/lib/templates";
import { getContactTimeline } from "@/lib/contact-activity";
import { createClient } from "@/lib/supabase/server";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";
import { ContactForm } from "../contact-form";
import {
  updateContact,
  deleteContact,
  archiveContact,
  unarchiveContact,
  type ContactFormState,
} from "../actions";
import { SendEmailPanel } from "./send-email-panel";
import { NotesEditor } from "./notes-editor";
import { ActivityTimeline } from "./activity-timeline";
import { AltEmailsPanel } from "./alt-emails-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const contact = await getContactById(id);
  if (!contact) notFound();

  const supabase = await createClient();
  const [{ data: workspaceData }, { data: account }, templates, timeline] =
    await Promise.all([
      supabase
        .from("contact_workspace_data")
        .select(
          "lead_stage_id, workspace_notes, total_emails_sent, total_emails_opened, total_replies",
        )
        .eq("contact_id", id)
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("email_accounts")
        .select("id, email, daily_quota, emails_sent_today, quota_reset_at")
        .eq("workspace_id", workspace.id)
        .eq("is_active", true)
        .maybeSingle(),
      listTemplates(workspace.id),
      getContactTimeline(id, workspace.id),
    ]);
  if (account) {
    (account as { emails_sent_today: number }).emails_sent_today =
      await ensureDailyQuotaFresh(
        supabase,
        account as {
          id: string;
          emails_sent_today: number;
          quota_reset_at: string | null;
        },
      );
  }

  async function updateAction(_prev: ContactFormState, formData: FormData) {
    "use server";
    return await updateContact(id, slug, _prev, formData);
  }

  async function deleteAction() {
    "use server";
    await deleteContact(id, slug);
    redirect(`/w/${slug}/contacts`);
  }

  async function archiveAction() {
    "use server";
    await archiveContact(id, slug);
  }

  async function unarchiveAction() {
    "use server";
    await unarchiveContact(id, slug);
  }

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.email;

  const archiveReasonLabels: Record<string, string> = {
    hard_bounce: "Email tidak ditemukan (hard bounce)",
    soft_bounce_threshold: "Soft bounce 3x — auto-archived",
    domain_blocked: "Domain di-block (banyak hard bounce)",
    manual: "Di-archive manual oleh kamu",
    unsubscribed: "Unsubscribed",
    spam_complaint: "Dilaporkan sebagai spam",
    stale_unengaged: "Stale — 5+ email kirim, 0 open/reply, 30+ hari diem",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to contacts
      </Link>

      {/* Hero */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {fullName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {contact.email}
            </span>
            {contact.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                {contact.company}
              </span>
            )}
            {contact.email_verified_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success-text">
                <ShieldCheck className="h-3 w-3" />
                Email terverifikasi
              </span>
            ) : contact.enriched_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-text">
                <ShieldAlert className="h-3 w-3" />
                Email berisiko
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact.archived_at ? (
            <form action={unarchiveAction}>
              <Button variant="secondary" size="sm" type="submit">
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </Button>
            </form>
          ) : (
            <form action={archiveAction}>
              <Button variant="secondary" size="sm" type="submit">
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            </form>
          )}
          <form action={deleteAction}>
            <Button variant="destructive" size="sm" type="submit">
              Delete
            </Button>
          </form>
        </div>
      </div>

      {/* Archive / bounce banner */}
      {contact.archived_at && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning-soft/80 bg-warning-soft p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <Archive className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning-text">
              Kontak ini archived
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-warning-text">
              {contact.archive_reason
                ? archiveReasonLabels[contact.archive_reason] ??
                  contact.archive_reason
                : "Tidak akan dimasukkan ke queue baru, dan recipient pending sudah di-skip otomatis."}
              {contact.bounce_count > 0 && (
                <>
                  {" "}
                  <Badge variant="secondary" className="ml-1 align-middle">
                    {contact.bounce_count}× bounced
                  </Badge>
                </>
              )}
            </p>
          </div>
        </div>
      )}
      {!contact.archived_at && contact.bounce_count > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning-soft/80 bg-warning-soft p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-warning-text">
            Pernah bounce {contact.bounce_count}× (terakhir{" "}
            {contact.last_bounce_type ?? "—"}). Kalau soft-bounce mencapai 3,
            contact akan auto-archived.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat
          label="Sent"
          value={workspaceData?.total_emails_sent ?? 0}
        />
        <MiniStat
          label="Opened"
          value={workspaceData?.total_emails_opened ?? 0}
          accent="emerald"
        />
        <MiniStat
          label="Replies"
          value={workspaceData?.total_replies ?? 0}
          accent="blue"
        />
        <MiniStat
          label="Engagement"
          value={contact.engagement_score}
          accent={
            contact.engagement_score >= 50
              ? "emerald"
              : contact.engagement_score >= 20
                ? "amber"
                : undefined
          }
          hint="0-100"
        />
      </div>

      {/* Email addresses (primary + alts) */}
      <div className="mb-6">
        <AltEmailsPanel
          slug={slug}
          contactId={contact.id}
          primary={contact.email}
          alts={contact.alt_emails ?? []}
        />
      </div>

      {/* Send email panel */}
      <div className="mb-6">
        <SendEmailPanel
          slug={slug}
          contactId={contact.id}
          contactEmail={contact.email}
          templates={templates.map((t) => ({
            id: t.id,
            name: t.name,
            attachmentCount: t.attachments.length,
          }))}
          account={account}
        />
      </div>

      {/* Notes (workspace-scoped) */}
      <div className="mb-6">
        <NotesEditor
          slug={slug}
          contactId={contact.id}
          initialNotes={workspaceData?.workspace_notes ?? null}
        />
      </div>

      {/* Activity timeline */}
      <div className="mb-6">
        <ActivityTimeline events={timeline} />
      </div>

      {/* Edit form */}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-ink">
          Edit Contact
        </h2>
        <ContactForm
          pipelineStages={workspace.pipeline_stages}
          customFields={workspace.custom_fields_schema ?? []}
          initialContact={contact}
          initialLeadStageId={workspaceData?.lead_stage_id ?? null}
          action={updateAction}
          submitLabel="Save Changes"
        />
      </Card>
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue" | "amber";
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular tracking-tight ${
          accent === "emerald"
            ? "text-success"
            : accent === "blue"
              ? "text-info"
              : accent === "amber"
                ? "text-warning"
                : "text-ink"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
      <p className="mt-0.5 text-[10px] text-muted">
        {hint ?? "in this workspace"}
      </p>
    </div>
  );
}
