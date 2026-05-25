import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getTemplateById } from "@/lib/templates";
import { TemplateForm } from "../template-form";
import { updateTemplate, deleteTemplate, type TemplateFormState } from "../actions";
import { AttachmentsManager } from "./attachments-manager";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to templates
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
            {template.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {template.category ? (
              <span className="capitalize">{template.category}</span>
            ) : (
              "—"
            )}
            <span className="mx-2">·</span>
            <span>used {template.times_used} times</span>
          </p>
        </div>
        <form action={deleteAction}>
          <Button variant="destructive" size="sm" type="submit">
            Delete
          </Button>
        </form>
      </div>

      <Card className="p-6">
        <TemplateForm
          initialTemplate={template}
          action={updateAction}
          submitLabel="Save Changes"
          slug={slug}
          workspace={{
            signature_data: workspace.signature_data,
            color_theme: workspace.color_theme,
          }}
        />
      </Card>

      {/* Attachments */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Attachments
          </h2>
        </div>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          PDF / image lampiran untuk email. Max 5 MB per file. Dilampirkan
          otomatis di tiap email yang pakai template ini.
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
