import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspaces";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const formatTime = (t: string) => t.slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: workspace.color_theme }}
            />
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {workspace.business_type}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {workspace.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Workspace dashboard. Stats akan dimulai mengisi setelah lu connect
            Gmail dan kirim email pertama.
          </p>
        </div>
      </div>

      {/* Quick stats placeholder */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Sent today" value="—" hint="Belum ada Gmail connected" />
        <StatCard label="Opened" value="—" />
        <StatCard label="Replied" value="—" />
        <StatCard label="Quota" value={`0 / ${workspace.daily_target}`} />
      </div>

      {/* Schedule info */}
      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Default Schedule
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Schedule otomatis untuk send queues di workspace ini. Bisa di-override per queue.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-zinc-500 dark:text-zinc-500">Hari</dt>
            <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              Sen-Jum
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-500">Jam</dt>
            <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {formatTime(workspace.schedule_start_time)} – {formatTime(workspace.schedule_end_time)} WIB
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500 dark:text-zinc-500">Target Harian</dt>
            <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
              {workspace.daily_target} email
            </dd>
          </div>
        </dl>
      </div>

      {/* Pipeline stages */}
      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Pipeline
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
          Stages untuk kontak di workspace ini. Edit di Settings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {workspace.pipeline_stages.map((stage) => (
            <div
              key={stage.id}
              className="flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1 text-xs dark:border-zinc-800"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              <span className="text-zinc-700 dark:text-zinc-300">{stage.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Next steps */}
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <p className="font-medium text-emerald-900 dark:text-emerald-200">
          🎉 Workspace siap. Next steps (built di fase berikutnya):
        </p>
        <ul className="mt-2 space-y-1 text-xs text-emerald-800 dark:text-emerald-300">
          <li>Fase 3: Import kontak dari CSV</li>
          <li>Fase 4: Bikin template email + attach PDF</li>
          <li>Fase 5: Connect Gmail untuk workspace ini</li>
          <li>Fase 6: Setup send queue (otomatis kerja sendiri)</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-600">{hint}</p>
      )}
    </div>
  );
}
