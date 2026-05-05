import { notFound } from "next/navigation";
import Link from "next/link";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listQueues } from "@/lib/queues";
import {
  formatDays,
  formatTime,
  progressPercent,
} from "@/lib/queue-helpers";

export default async function QueuesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const queues = await listQueues(workspace.id);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Send Queues
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Queue otomatis kirim email tiap hari sesuai schedule. Setup sekali, kerja sendiri.
          </p>
        </div>
        <Link
          href={`/w/${slug}/queues/new`}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + New Queue
        </Link>
      </div>

      {queues.length === 0 ? (
        <div className="mt-12 flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
          <p className="text-base font-medium text-zinc-900 dark:text-zinc-100">
            Belum ada queue
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Bikin queue pertama untuk start kirim otomatis. Lu butuh: template + kontak + Gmail terhubung.
          </p>
          <Link
            href={`/w/${slug}/queues/new`}
            className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + New Queue
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {queues.map((q) => {
            const pct = progressPercent(q);
            return (
              <Link
                key={q.id}
                href={`/w/${slug}/queues/${q.id}`}
                className="block rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          q.is_active ? "bg-emerald-500" : "bg-zinc-400"
                        }`}
                      />
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {q.name}
                      </h2>
                      {!q.is_active && (
                        <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Paused
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatDays(q.schedule_days)} ·{" "}
                      {formatTime(q.schedule_start_time)} – {formatTime(q.schedule_end_time)} WIB ·{" "}
                      {q.daily_target}/hari
                    </p>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    {q.total_sent} / {q.total_in_queue} sent
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-zinc-500">{pct}% complete</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
