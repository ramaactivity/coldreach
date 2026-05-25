import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { TemplateForm } from "../template-form";
import { createTemplate, type TemplateFormState } from "../actions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";

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
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to templates
      </Link>
      <PageHeader
        title="New Template"
        description={`Buat template email untuk workspace ${workspace.name}. Attachment bisa di-upload setelah save.`}
      />
      <Card className="p-6">
        <TemplateForm
          action={action}
          submitLabel="Save Template"
          slug={slug}
          workspace={{
            signature_data: workspace.signature_data,
            color_theme: workspace.color_theme,
          }}
        />
      </Card>
    </div>
  );
}
