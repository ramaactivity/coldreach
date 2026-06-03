import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Rocket,
  Calendar,
  Clock,
  Target,
  Shield,
  CheckCircle2,
  Pause,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { createClient } from "@/lib/supabase/server";
import type { SendQueue } from "@/lib/queue-helpers";
import { progressPercent } from "@/lib/queue-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CampaignsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("send_queues")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("is_one_shot", true)
    .order("created_at", { ascending: false });
  const campaigns = (data ?? []) as SendQueue[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Campaigns"
        description="One-shot blast — kirim sekali ke audience tertentu, lalu selesai. Beda dari Queue yang berulang harian."
        actions={
          <ButtonLink href={`/w/${slug}/campaigns/new`}>
            <Plus className="h-4 w-4" />
            New Campaign
          </ButtonLink>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title="Belum ada campaign"
          description="Bikin one-shot campaign untuk blast email ke audience tertentu sekali aja. Cocok untuk: launching, promo terbatas, follow-up event, atau outreach batch baru."
          action={
            <ButtonLink href={`/w/${slug}/campaigns/new`}>
              <Plus className="h-4 w-4" />
              New Campaign
            </ButtonLink>
          }
        />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const pct = progressPercent(c);
            const isCompleted = !c.is_active && c.total_pending === 0;
            const isScheduled =
              c.is_active &&
              c.scheduled_start_at &&
              new Date(c.scheduled_start_at) > new Date();
            return (
              <Link
                key={c.id}
                href={`/w/${slug}/campaigns/${c.id}`}
                className="group block overflow-hidden rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        completed={isCompleted}
                        scheduled={!!isScheduled}
                        active={c.is_active && !isScheduled}
                      />
                      <h2 className="truncate text-base font-semibold text-ink">
                        {c.name}
                      </h2>
                      {c.test_mode && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info">
                          <Shield className="h-2.5 w-2.5" />
                          Test
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-text">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Completed
                        </span>
                      )}
                      {isScheduled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                          <Clock className="h-2.5 w-2.5" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {c.daily_target}/run rate
                      </span>
                      {c.scheduled_start_at && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(c.scheduled_start_at).toLocaleString(
                            "id-ID",
                            { dateStyle: "medium", timeStyle: "short" },
                          )}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        Created{" "}
                        {new Date(c.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-2xl font-semibold tabular tracking-tight text-ink">
                      {pct}%
                    </p>
                    <p className="text-xs text-muted">
                      {c.total_sent.toLocaleString("id-ID")} /{" "}
                      {c.total_in_queue.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCompleted
                        ? "bg-success"
                        : c.is_active && !isScheduled
                          ? "bg-info"
                          : "bg-border-strong"
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

function StatusIcon({
  completed,
  scheduled,
  active,
}: {
  completed: boolean;
  scheduled: boolean;
  active: boolean;
}) {
  if (completed) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
  }
  if (scheduled) {
    return <Clock className="h-3.5 w-3.5 text-warning" />;
  }
  if (active) {
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
      </span>
    );
  }
  return <Pause className="h-3 w-3 text-faint" />;
}
