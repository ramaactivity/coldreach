import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Target,
  Sparkles,
  Mail,
  AlertCircle,
  Shield,
  Trophy,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import { getQueueById, getQueueStats } from "@/lib/queues";
import { createClient } from "@/lib/supabase/server";
import { ensureDailyQuotaFresh } from "@/lib/quota-reset";
import { formatDays, formatTime, progressPercent } from "@/lib/queue-helpers";
import { QueueActionsBar } from "./queue-actions-bar";
import { FollowupSequenceEditor } from "./followup-sequence-editor";
import { TemplatePoolEditor } from "./template-pool-editor";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { FollowupStep } from "@/lib/queue-helpers";

export default async function QueueDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  // Parallelize: workspace, queue, stats — all independent
  const [workspace, queue, stats] = await Promise.all([
    getWorkspaceBySlug(slug),
    getQueueById(id),
    getQueueStats(id),
  ]);
  if (!workspace) notFound();
  if (!queue) notFound();
  const pct = progressPercent(queue);

  // Now parallelize account + all-templates + per-template breakdown
  const supabase = await createClient();
  const [accountResult, allTemplatesResult, breakdownResult] =
    await Promise.all([
      supabase
        .from("email_accounts")
        .select("id, email, daily_quota, emails_sent_today, quota_reset_at")
        .eq("workspace_id", workspace.id)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .is("deleted_at", null)
        .order("name"),
      supabase.rpc("get_queue_template_breakdown", { p_queue_id: id }),
    ]);
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
  const allTemplates = (allTemplatesResult.data ?? []) as Array<{
    id: string;
    name: string;
  }>;
  const templateNameById = new Map(allTemplates.map((t) => [t.id, t.name]));

  // Effective template pool for this queue (new array, fallback to single).
  const queueTemplateIds: string[] =
    Array.isArray(queue.template_ids) && queue.template_ids.length > 0
      ? queue.template_ids
      : queue.template_id
        ? [queue.template_id]
        : [];
  const queueTemplates = queueTemplateIds.map((tid) => ({
    id: tid,
    name: templateNameById.get(tid) ?? "(template terhapus)",
  }));
  const primaryTemplateName = queueTemplates[0]?.name ?? null;

  // Per-template A/B breakdown.
  const breakdown = (
    (breakdownResult.data ?? []) as Array<{
      template_id: string;
      sent: number;
      opened: number;
      replied: number;
    }>
  )
    .map((r) => ({
      template_id: r.template_id,
      name: templateNameById.get(r.template_id) ?? "(template terhapus)",
      sent: r.sent,
      open_rate: r.sent > 0 ? r.opened / r.sent : 0,
      reply_rate: r.sent > 0 ? r.replied / r.sent : 0,
    }))
    .sort((a, b) => b.sent - a.sent);
  // Highlight the winner (best reply rate) only when there's something to
  // compare and at least one reply.
  const bestReplyId =
    breakdown.length > 1 && breakdown.some((r) => r.reply_rate > 0)
      ? breakdown.reduce((best, r) =>
          r.reply_rate > best.reply_rate ? r : best,
        ).template_id
      : null;

  // Resolve effective followup steps (prefer new array, fallback to legacy)
  let followupSteps: FollowupStep[] = Array.isArray(queue.followup_steps)
    ? (queue.followup_steps as FollowupStep[])
    : [];
  if (
    followupSteps.length === 0 &&
    queue.followup_enabled &&
    queue.followup_template_id
  ) {
    followupSteps = [
      {
        template_id: queue.followup_template_id,
        after_days: queue.followup_after_days ?? 4,
      },
    ];
  }

  const remainingQuota = account
    ? account.daily_quota - account.emails_sent_today
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/w/${slug}/queues`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to queues
      </Link>

      {/* Test mode banner */}
      {queue.test_mode && account && (
        <div className="mb-4 flex items-start gap-3 overflow-hidden rounded-xl border border-info-soft bg-info-soft p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
            <Shield className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-info-text">
              Queue ini di Test Mode — semua email aman ke{" "}
              <strong>{account.email}</strong>
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-info-text">
              Saat lu klik &quot;Send&quot;, recipient asli di-override ke akun Gmail
              terhubung dengan subject{" "}
              <code className="rounded bg-info-soft px-1 font-mono text-[10px]">
                [TEST]
              </code>
              . Cron auto-run di-skip — cuma manual &quot;Run Now&quot; yang trigger.
            </p>
          </div>
        </div>
      )}

      {/* Hero header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2.5">
            {queue.is_active ? (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
              </span>
            ) : (
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-faint" />
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {queue.name}
            </h1>
            {queue.test_mode && (
              <Badge variant="info" className="font-semibold uppercase tracking-wide">
                <Shield className="h-2.5 w-2.5" />
                Test Mode
              </Badge>
            )}
            {!queue.is_active && <Badge variant="secondary">Paused</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
            {queueTemplates.length > 0 && (
              <span className="inline-flex flex-wrap items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Template:
                {queueTemplates.map((t) => (
                  <strong
                    key={t.id}
                    className="font-medium text-ink"
                  >
                    {t.name}
                  </strong>
                ))}
                {queueTemplates.length > 1 && (
                  <Badge variant="success">
                    {queueTemplates.length} · rotasi
                  </Badge>
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDays(queue.schedule_days)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTime(queue.schedule_start_time)}–{formatTime(queue.schedule_end_time)} WIB
            </span>
            <span className="inline-flex items-center gap-1">
              <Target className="h-3 w-3" />
              {queue.daily_target}/hari
            </span>
          </div>
        </div>
      </div>

      {/* Progress card */}
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
                queue.is_active
                  ? "bg-success"
                  : "bg-faint"
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
            <Progress
              className="mt-2"
              value={account.emails_sent_today}
              cap={account.daily_quota}
            />
          </div>
        ) : (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning-soft bg-warning-soft p-3 text-xs text-warning-text">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>
              Belum ada Gmail terhubung. Connect Gmail di{" "}
              <Link
                href={`/w/${slug}/settings`}
                className="font-medium underline hover:no-underline"
              >
                Settings
              </Link>{" "}
              sebelum kirim.
            </p>
          </div>
        )}
      </Card>

      {/* Actions */}
      <QueueActionsBar
        slug={slug}
        queueId={queue.id}
        isActive={queue.is_active}
        canSend={!!account && remainingQuota > 0 && stats.pending > 0}
        pendingCount={stats.pending}
        lastShuffledAt={queue.last_shuffled_at}
        lastRefilledAt={queue.last_refilled_at}
        audienceType={
          (queue.audience_filter as { type?: string } | null)?.type ?? "all"
        }
      />

      {/* Template pool (rotation) */}
      <div className="mt-4">
        <TemplatePoolEditor
          slug={slug}
          queueId={queue.id}
          templates={allTemplates}
          initialSelected={queueTemplateIds}
        />
      </div>

      {/* Per-template A/B breakdown */}
      {breakdown.length > 0 && (
        <Card className="mt-4 p-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Trophy className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-ink">
              Performa per template
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
                  <th className="px-5 py-2.5 font-semibold">Template</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Terkirim
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    Open rate
                  </th>
                  <th className="px-5 py-2.5 text-right font-semibold">
                    Reply rate
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {breakdown.map((r) => (
                  <tr key={r.template_id}>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                        {r.name}
                        {r.template_id === bestReplyId && (
                          <Badge variant="success">
                            <Trophy className="h-2.5 w-2.5" />
                            Terbaik
                          </Badge>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular text-ink-secondary">
                      {r.sent.toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-3 text-right tabular text-ink-secondary">
                      {Math.round(r.open_rate * 100)}%
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium tabular ${
                        r.template_id === bestReplyId
                          ? "text-success"
                          : "text-ink-secondary"
                      }`}
                    >
                      {Math.round(r.reply_rate * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2.5 text-[11px] text-faint">
            Atribusi per kiriman — angka mencerminkan template yang
            benar-benar dipakai tiap email.
          </p>
        </Card>
      )}

      {/* Follow-up sequence */}
      <div className="mt-4">
        <FollowupSequenceEditor
          slug={slug}
          queueId={queue.id}
          templates={allTemplates}
          initialSteps={followupSteps}
          primaryTemplateName={primaryTemplateName}
        />
      </div>

      {/* Settings */}
      <Card className="mt-4 p-0">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-ink">
            Configuration
          </h3>
        </div>
        <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <DetailRow
            label="AI personalization"
            value={
              queue.use_ai_opener ? (
                <Badge variant="info">On</Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )
            }
          />
          <DetailRow
            label="Follow-up steps"
            value={
              followupSteps.length > 0 ? (
                <Badge variant="info">{followupSteps.length} step</Badge>
              ) : (
                <Badge variant="secondary">Off</Badge>
              )
            }
          />
          <DetailRow
            label="Created"
            value={
              <span className="text-xs text-ink-secondary">
                {new Date(queue.created_at).toLocaleString("id-ID", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            }
          />
          <DetailRow
            label="Last run"
            value={
              <span className="text-xs text-ink-secondary">
                {queue.last_run_at
                  ? new Date(queue.last_run_at).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
            }
          />
        </dl>
      </Card>
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

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="px-5 py-3.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="mt-1.5">{value}</dd>
    </div>
  );
}
