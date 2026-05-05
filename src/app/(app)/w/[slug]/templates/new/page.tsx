import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { TemplateForm } from "../template-form";
import { createTemplate, type TemplateFormState } from "../actions";

export default async function NewTemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  async function action(_prev: TemplateFormState, formData: FormData) {
    "use server";
    const result = await createTemplate(slug, _prev, formData);
    if (result.templateId) {
      redirect(`/w/${slug}/templates/${result.templateId}`);
    }
    return result;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href={`/w/${slug}/templates`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        ← Back to templates
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        New Template
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Buat template email untuk workspace {workspace.name}. Attachment bisa di-upload setelah save.
      </p>
      <div className="mt-6">
        <TemplateForm action={action} submitLabel="Save Template" />
      </div>
    </div>
  );
}
