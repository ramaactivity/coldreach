import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getTemplateById } from "@/lib/templates";
import { TemplateForm } from "../template-form";
import { updateTemplate, deleteTemplate, type TemplateFormState } from "../actions";
import { AttachmentsManager } from "./attachments-manager";

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const template = await getTemplateById(id);
  if (!template) notFound();

  async function updateAction(_prev: TemplateFormState, formData: FormData) {
    "use server";
    return await updateTemplate(id, slug, _prev, formData);
  }

  async function deleteAction() {
    "use server";
    await deleteTemplate(id, slug);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href={`/w/${slug}/templates`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to templates
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {template.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {template.category ?? "—"} · used {template.times_used} times
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

      <div className="mt-6">
        <TemplateForm
          initialTemplate={template}
          action={updateAction}
          submitLabel="Save Changes"
        />
      </div>

      {/* Attachments */}
      <div className="mt-10 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Attachments
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          PDF / image lampiran untuk email. Max 5 MB per file. Dilampirkan otomatis di tiap email yang pakai template ini.
        </p>
        <AttachmentsManager
          templateId={id}
          slug={slug}
          attachments={template.attachments}
        />
      </div>
    </div>
  );
}
