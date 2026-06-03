import { notFound } from "next/navigation";
import { Plus, FileText } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates, getTemplateStats } from "@/lib/templates";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { TemplatesGrid } from "./templates-grid";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const [templates, stats] = await Promise.all([
    listTemplates(workspace.id),
    getTemplateStats(workspace.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <PageHeader
        title="Templates"
        description={`${templates.length} template${templates.length === 1 ? "" : "s"} · workspace-specific (${workspace.name})`}
        actions={
          <ButtonLink href={`/w/${slug}/templates/new`}>
            <Plus className="h-4 w-4" />
            New Template
          </ButtonLink>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Belum ada template"
          description="Bikin template email pertama lu untuk workspace ini. Gunakan {first_name}, {company}, {ai_opener} sebagai variable yang otomatis di-fill saat kirim."
          action={
            <ButtonLink href={`/w/${slug}/templates/new`}>
              <Plus className="h-4 w-4" />
              New Template
            </ButtonLink>
          }
        />
      ) : (
        <TemplatesGrid slug={slug} templates={templates} stats={stats} />
      )}
    </div>
  );
}
