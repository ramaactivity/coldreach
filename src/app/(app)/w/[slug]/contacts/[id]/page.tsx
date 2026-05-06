import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Mail, Building2 } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getContactById } from "@/lib/contacts";
import { listTemplates } from "@/lib/templates";
import { getContactTimeline } from "@/lib/contact-activity";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../contact-form";
import { updateContact, deleteContact, type ContactFormState } from "../actions";
import { SendEmailPanel } from "./send-email-panel";
import { NotesEditor } from "./notes-editor";
import { ActivityTimeline } from "./activity-timeline";
import { Button } from "@/components/ui/button";
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
        .select("email, daily_quota, emails_sent_today")
        .eq("workspace_id", workspace.id)
        .eq("is_active", true)
        .maybeSingle(),
      listTemplates(workspace.id),
      getContactTimeline(id, workspace.id),
    ]);

  async function updateAction(_prev: ContactFormState, formData: FormData) {
    "use server";
    return await updateContact(id, slug, _prev, formData);
  }

  async function deleteAction() {
    "use server";
    await deleteContact(id, slug);
    redirect(`/w/${slug}/contacts`);
  }

  const fullName =
    [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
    contact.email;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to contacts
      </Link>

      {/* Hero */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
            {fullName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
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
          </div>
        </div>
        <form action={deleteAction}>
          <Button variant="destructive" size="sm" type="submit">
            Delete
          </Button>
        </form>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
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
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Edit Contact
        </h2>
        <ContactForm
          pipelineStages={workspace.pipeline_stages}
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
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue";
}) {
  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${
          accent === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : accent === "blue"
              ? "text-blue-600 dark:text-blue-400"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500 dark:text-zinc-400">
        in this workspace
      </p>
    </div>
  );
}
