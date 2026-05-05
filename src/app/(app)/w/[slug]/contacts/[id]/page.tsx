import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getContactById } from "@/lib/contacts";
import { createClient } from "@/lib/supabase/server";
import { ContactForm } from "../contact-form";
import { updateContact, deleteContact, type ContactFormState } from "../actions";

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

  // Fetch workspace-specific data
  const supabase = await createClient();
  const { data: workspaceData } = await supabase
    .from("contact_workspace_data")
    .select("lead_stage_id, workspace_notes")
    .eq("contact_id", id)
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  async function updateAction(_prev: ContactFormState, formData: FormData) {
    "use server";
    return await updateContact(id, slug, _prev, formData);
  }

  async function deleteAction() {
    "use server";
    await deleteContact(id, slug);
    redirect(`/w/${slug}/contacts`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href={`/w/${slug}/contacts`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to contacts
      </Link>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {[contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
              contact.email}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {contact.email}
            {contact.company && ` · ${contact.company}`}
          </p>
        </div>
        <form action={deleteAction}>
          <button
            type="submit"
            className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            Delete
          </button>
        </form>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
        <Stat label="Sent (this workspace)" value="0" />
        <Stat label="Opened" value="0" />
        <Stat label="Replies" value="0" />
      </div>

      {/* Edit form */}
      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Edit
        </h2>
        <ContactForm
          pipelineStages={workspace.pipeline_stages}
          initialContact={contact}
          initialLeadStageId={workspaceData?.lead_stage_id ?? null}
          action={updateAction}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
    </div>
  );
}
