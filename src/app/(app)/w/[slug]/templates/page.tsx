import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listTemplates } from "@/lib/templates";

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Templates
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {templates.length} templates · workspace-specific ({workspace.name})
          </p>
        </div>
        <Link
          href={`/w/${slug}/templates/new`}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + New Template
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            Belum ada template
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Bikin template email pertama lu untuk workspace ini.
          </p>
          <Link
            href={`/w/${slug}/templates/new`}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + New Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/w/${slug}/templates/${t.id}`}
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-semibold text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-100">
                    {t.name}
                  </h2>
                  {t.category && (
                    <p className="mt-0.5 text-xs text-zinc-500">{t.category}</p>
                  )}
                </div>
                {t.attachments.length > 0 && (
                  <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    📎 {t.attachments.length}
                  </span>
                )}
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-400">
                {t.subject_lines[0] ?? "(no subject)"}
              </p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.variables_used.slice(0, 4).map((v) => (
                  <code
                    key={v}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {`{${v}}`}
                  </code>
                ))}
                {t.variables_used.length > 4 && (
                  <span className="text-xs text-zinc-500">+{t.variables_used.length - 4}</span>
                )}
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                {t.subject_lines.length} subject {t.subject_lines.length > 1 ? "variants" : "variant"} · {t.times_used} times used
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
