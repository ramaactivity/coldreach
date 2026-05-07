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
                className="group block overflow-hidden rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StatusIcon
                        completed={isCompleted}
                        scheduled={!!isScheduled}
                        active={c.is_active && !isScheduled}
                      />
                      <h2 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {c.name}
                      </h2>
                      {c.test_mode && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
                          <Shield className="h-2.5 w-2.5" />
                          Test
                        </span>
                      )}
                      {isCompleted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Completed
                        </span>
                      )}
                      {isScheduled && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                          <Clock className="h-2.5 w-2.5" />
                          Scheduled
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
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
                    <p className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-100">
                      {pct}%
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {c.total_sent.toLocaleString("id-ID")} /{" "}
                      {c.total_in_queue.toLocaleString("id-ID")}
                    </p>
                  </div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isCompleted
                        ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                        : c.is_active && !isScheduled
                          ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                          : "bg-zinc-300 dark:bg-zinc-700"
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
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (scheduled) {
    return <Clock className="h-3.5 w-3.5 text-amber-500" />;
  }
  if (active) {
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
      </span>
    );
  }
  return <Pause className="h-3 w-3 text-zinc-400" />;
}
