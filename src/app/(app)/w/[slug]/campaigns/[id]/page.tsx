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
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      <Link
        href={`/w/${slug}/campaigns`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to campaigns
      </Link>

      {/* Test mode banner */}
      {queue.test_mode && account && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-info-soft bg-info-soft p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-info-text">
              Campaign ini di Test Mode — semua email aman ke{" "}
              <strong>{account.email}</strong>
            </p>
            <p className="mt-0.5 text-xs text-info-text">
              Cron auto-runner di-skip — manual &quot;Run Now&quot; untuk trigger.
            </p>
          </div>
        </div>
      )}

      {/* Scheduled banner */}
      {isScheduled && queue.scheduled_start_at && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-warning-soft bg-warning-soft p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warning-text">
              Scheduled to start at{" "}
              {new Date(queue.scheduled_start_at).toLocaleString("id-ID", {
                dateStyle: "full",
                timeStyle: "short",
              })}
            </p>
            <p className="mt-0.5 text-xs text-warning-text">
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
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : isScheduled ? (
              <Clock className="h-5 w-5 text-warning" />
            ) : queue.is_active ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-info" />
              </span>
            ) : (
              <Rocket className="h-5 w-5 text-faint" />
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            {template?.name && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Template: <strong className="font-medium text-ink">{template.name}</strong>
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
        <div className="border-b border-border p-5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">
              Progress
            </p>
            <p className="text-xs text-muted">
              <span className="text-base font-semibold tabular text-ink">
                {queue.total_sent.toLocaleString("id-ID")}
              </span>
              <span className="mx-1">/</span>
              {queue.total_in_queue.toLocaleString("id-ID")} sent ({pct}%)
            </p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full rounded-full transition-all ${
                isCompleted
                  ? "bg-success"
                  : queue.is_active && !isScheduled
                    ? "bg-info"
                    : "bg-border-strong"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
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
          <Mail className="h-4 w-4 text-muted" />
          <p className="text-sm font-semibold text-ink">
            Today&apos;s Gmail quota
          </p>
        </div>
        {account ? (
          <div className="mt-3">
            <p className="text-sm text-ink-secondary">
              <strong>{account.email}</strong>
            </p>
            <p className="mt-1 text-xs text-muted tabular">
              {account.emails_sent_today} / {account.daily_quota} sent today ·{" "}
              <span
                className={
                  remainingQuota === 0
                    ? "text-danger font-medium"
                    : ""
                }
              >
                {remainingQuota} remaining
              </span>
            </p>
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft p-3 text-xs text-warning-text">
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
          lastShuffledAt={queue.last_shuffled_at}
          lastRefilledAt={queue.last_refilled_at}
          audienceType={
            (queue.audience_filter as { type?: string } | null)?.type ?? "manual"
          }
        />
      )}

      {isCompleted && (
        <Card className="mt-4 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-soft">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">
                Campaign Completed
              </p>
              <p className="mt-0.5 text-xs text-muted">
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
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular tracking-tight ${
          accent === "emerald"
            ? "text-success"
            : accent === "blue"
              ? "text-info"
              : "text-ink"
        }`}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
