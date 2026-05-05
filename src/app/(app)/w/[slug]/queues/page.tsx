import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, Send, Pause, Calendar, Clock, Target } from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { listQueues } from "@/lib/queues";
import { formatDays, formatTime, progressPercent } from "@/lib/queue-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
      <PageHeader
        title="Send Queues"
        description="Queue otomatis kirim email tiap hari sesuai schedule. Setup sekali, kerja sendiri."
        actions={
          <ButtonLink href={`/w/${slug}/queues/new`}>
            <Plus className="h-4 w-4" />
            New Queue
          </ButtonLink>
        }
      />

      {queues.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Belum ada queue"
          description="Bikin queue pertama untuk start kirim otomatis. Lu butuh: template, kontak, dan Gmail terhubung."
          action={
            <ButtonLink href={`/w/${slug}/queues/new`}>
              <Plus className="h-4 w-4" />
              New Queue
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-3">
          {queues.map((q) => {
            const pct = progressPercent(q);
            return (
              <Link
                key={q.id}
                href={`/w/${slug}/queues/${q.id}`}
                className="group block overflow-hidden rounded-xl border border-zinc-200/80 bg-white p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {q.is_active ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <Pause className="h-2.5 w-2.5 text-zinc-400" />
                      )}
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {q.name}
                      </h2>
                      {!q.is_active && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDays(q.schedule_days)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(q.schedule_start_time)}–{formatTime(q.schedule_end_time)} WIB
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {q.daily_target}/hari
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                      {pct}%
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {q.total_sent.toLocaleString("id-ID")} / {q.total_in_queue.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      q.is_active
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : "bg-zinc-400 dark:bg-zinc-600"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
