import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Target,
  Sparkles,
  Mail,
  AlertCircle,
  Shield,
  Calendar,
  Clock,
  Rocket,
  CheckCircle2,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getQueueById, getQueueStats } from "@/lib/queues";
import { createClient } from "@/lib/supabase/server";
import { progressPercent } from "@/lib/queue-helpers";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";
import { QueueActionsBar } from "../../queues/[id]/queue-actions-bar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const [workspace, queue, stats] = await Promise.all([
    getWorkspaceBySlug(slug),
    getQueueById(id),
    getQueueStats(id),
  ]);
  if (!workspace) notFound();
  if (!queue) notFound();
  if (!queue.is_one_shot) {
    // Wrong type — redirect to /queues detail
    notFound();
  }
  const pct = progressPercent(queue);

  const supabase = await createClient();
  const [templateResult, accountResult] = await Promise.all([
    queue.template_id
      ? supabase
          .from("templates")
          .select("name")
          .eq("id", queue.template_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("email_accounts")
      .select("id, email, daily_quota, emails_sent_today, quota_reset_at")
      .eq("workspace_id", workspace.id)
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const template = templateResult.data;
  const account = accountResult.data as
    | {
        id: string;
        email: string;
        daily_quota: number;
        emails_sent_today: number;
        quota_reset_at: string | null;
      }
    | null;
  if (account) {
    account.emails_sent_today = await ensureDailyQuotaFresh(supabase, account);
  }
  const remainingQuota = account ? account.daily_quota - account.emails_sent_today : 0;

  const isCompleted = !queue.is_active && queue.total_pending === 0;
  const isScheduled =
    queue.is_active &&
    queue.scheduled_start_at &&
    new Date(queue.scheduled_start_at) > new Date();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/w/${slug}/campaigns`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to campaigns
      </Link>

      {/* Test mode banner */}
      {queue.test_mode && account && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50/60 p-4 dark:border-blue-900/50 dark:from-blue-950/30 dark:to-indigo-950/20">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Campaign ini di Test Mode — semua email aman ke{" "}
              <strong>{account.email}</strong>
            </p>
            <p className="mt-0.5 text-xs text-blue-800 dark:text-blue-300">
              Cron auto-runner di-skip — manual "Run Now" untuk trigger.
            </p>
          </div>
        </div>
      )}

      {/* Scheduled banner */}
      {isScheduled && queue.scheduled_start_at && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/60 p-4 dark:border-amber-900/50 dark:from-amber-950/30 dark:to-orange-950/20">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Scheduled to start at{" "}
              {new Date(queue.scheduled_start_at).toLocaleString("id-ID", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              Cron pickup tiap 30 menit, akan blast otomatis setelah waktu ini.
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5">
            {isCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            ) : isScheduled ? (
              <Clock className="h-5 w-5 text-amber-500" />
            ) : queue.is_active ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
              </span>
            ) : (
              <Rocket className="h-5 w-5 text-zinc-400" />
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl dark:text-zinc-50">
              {queue.name}
            </h1>
            {queue.test_mode && (
              <Badge variant="info" className="font-semibold uppercase tracking-wide">
                <Shield className="h-2.5 w-2.5" />
                Test
              </Badge>
            )}
            {isCompleted && (
              <Badge variant="success" className="font-semibold uppercase tracking-wide">
                Completed
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            {template?.name && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Template: <strong className="font-medium text-zinc-900 dark:text-zinc-100">{template.name}</strong>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {queue.daily_target}/run
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Created{" "}
              {new Date(queue.created_at).toLocaleDateString("id-ID", {
                dateStyle: "medium",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-zinc-100 p-5 dark:border-zinc-800">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Progress
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              <span className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                {queue.total_sent.toLocaleString("id-ID")}
              </span>
              <span className="mx-1">/</span>
              {queue.total_in_queue.toLocaleString("id-ID")} sent ({pct}%)
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                isCompleted
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : queue.is_active && !isScheduled
                    ? "bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-500"
                    : "bg-zinc-300 dark:bg-zinc-700"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-zinc-100 sm:grid-cols-4 sm:divide-x dark:divide-zinc-800">
          <MiniStat label="Pending" value={stats.pending} />
          <MiniStat label="Sent" value={stats.sent} accent="emerald" />
          <MiniStat label="Replied" value={stats.replied} accent="blue" />
          <MiniStat
            label="Skipped/Bounced"
            value={stats.skipped + stats.bounced}
          />
        </div>
      </Card>

      {/* Quota card */}
      <Card className="mt-4 p-5">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Today's Gmail quota
          </p>
        </div>
        {account ? (
          <div className="mt-3">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <strong>{account.email}</strong>
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
              {account.emails_sent_today} / {account.daily_quota} sent today ·{" "}
              <span
                className={
                  remainingQuota === 0
                    ? "text-red-600 dark:text-red-400 font-medium"
                    : ""
                }
              >
                {remainingQuota} remaining
              </span>
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-400">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Belum ada Gmail terhubung. Connect di{" "}
              <Link
                href={`/w/${slug}/settings`}
                className="font-medium underline hover:no-underline"
              >
                Settings
              </Link>
              .
            </p>
          </div>
        )}
      </Card>

      {/* Actions (reuse queue actions bar — same controls work) */}
      {!isCompleted && (
        <QueueActionsBar
          slug={slug}
          queueId={queue.id}
          isActive={queue.is_active}
          canSend={!!account && remainingQuota > 0 && stats.pending > 0}
          pendingCount={stats.pending}
        />
      )}

      {isCompleted && (
        <Card className="mt-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Campaign Completed
              </p>
              <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                Semua kontak sudah dikirim. Cek replies di Dashboard.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "blue";
}) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${
          accent === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : accent === "blue"
              ? "text-blue-600 dark:text-blue-400"
              : "text-zinc-900 dark:text-zinc-100"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
