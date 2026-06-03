import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus, Send, Pause, Calendar, Clock, Target, Shield } from "lucide-react";
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
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
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
                className="group block overflow-hidden rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {q.is_active ? (
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                        </span>
                      ) : (
                        <Pause className="h-2.5 w-2.5 text-faint" />
                      )}
                      <h2 className="truncate text-base font-semibold text-ink">
                        {q.name}
                      </h2>
                      {q.test_mode && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                          <Shield className="h-2.5 w-2.5" />
                          Test Mode
                        </span>
                      )}
                      {!q.is_active && (
                        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-muted">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
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
                    <p className="text-2xl font-semibold tabular tracking-tight text-ink">
                      {pct}%
                    </p>
                    <p className="text-xs text-muted">
                      {q.total_sent.toLocaleString("id-ID")} / {q.total_in_queue.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full transition-all ${
                      q.is_active
                        ? "bg-success"
                        : "bg-faint"
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
