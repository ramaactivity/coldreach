import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, FileText, Paperclip, ArrowUpRight } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates } from "@/lib/templates";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function TemplatesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const templates = await listTemplates(workspace.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/w/${slug}/templates/${t.id}`}
              className="group relative overflow-hidden rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.name}
                    </h2>
                    {t.attachments.length > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        <Paperclip className="h-2.5 w-2.5" />
                        {t.attachments.length}
                      </span>
                    )}
                  </div>
                  {t.category && (
                    <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      {t.category}
                    </p>
                  )}
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-700 dark:text-zinc-700 dark:group-hover:text-zinc-300" />
              </div>

              <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                {t.subject_lines[0] ?? "(no subject)"}
              </p>

              {t.variables_used.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {t.variables_used.slice(0, 4).map((v) => (
                    <code
                      key={v}
                      className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {`{${v}}`}
                    </code>
                  ))}
                  {t.variables_used.length > 4 && (
                    <span className="text-[10px] text-zinc-500">
                      +{t.variables_used.length - 4}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <span>
                  {t.subject_lines.length} subject{" "}
                  {t.subject_lines.length > 1 ? "variants" : "variant"}
                </span>
                <span>{t.times_used} times used</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
