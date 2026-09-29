import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Send,
  Eye,
  MessageCircle,
  Inbox,
  Users,
  FileText,
  Activity,
  Sparkles,
  Plus,
  ExternalLink,
  ArrowRight,
  Clock,
  Calendar,
  Target,
  AlertTriangle,
  SkipForward,
  Archive,
  ShieldAlert,
} from "lucide-react";
import { getWorkspaceBySlug } from "@/lib/workspaces";
import {
  getWorkspaceStats,
  getRecentReplies,
  getRecentActivity,
} from "@/lib/stats";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { HolidayNotice } from "@/components/holiday-notice";
import { ApolloCreditNotice } from "@/components/apollo-credit-notice";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const [stats, replies, activity] = await Promise.all([
    getWorkspaceStats(workspace.id),
    getRecentReplies(workspace.id, 8),
    getRecentActivity(workspace.id, 10),
  ]);

  const formatTime = (t: string) => t.slice(0, 5);
  const replyRate =
    stats.sent_7d > 0
      ? Math.round((stats.replied_7d / stats.sent_7d) * 100)
      : 0;
  const openRate =
    stats.sent_7d > 0
      ? Math.round((stats.opened_7d / stats.sent_7d) * 100)
      : 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8">
      {/* Workspace hero — the one place the display (30px) title is used. */}
      <div className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1">
              <span className="inline-block size-1.5 rounded-full bg-accent" />
              <span className="label-eyebrow text-muted">
                {workspace.business_type}
              </span>
            </div>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-ink">
              {workspace.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3 w-3" />
                Sen-Jum
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {formatTime(workspace.schedule_start_time)} – {formatTime(workspace.schedule_end_time)} WIB
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Target className="h-3 w-3" />
                {workspace.daily_target}/hari target
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAction href={`/w/${slug}/queues/new`} primary>
              <Plus className="h-3.5 w-3.5" /> New Queue
            </QuickAction>
            <QuickAction href={`/w/${slug}/templates/new`}>
              <Plus className="h-3.5 w-3.5" /> New Template
            </QuickAction>
          </div>
        </div>
      </div>

      <HolidayNotice />
      <ApolloCreditNotice slug={slug} />

      {/* KPI grid - top row: send/perf */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="Sent today"
          value={stats.sent_today.toLocaleString("id-ID")}
          icon={Send}
          hint={
            stats.quota_today
              ? `${stats.quota_today.sent}/${stats.quota_today.quota} quota${
                  stats.quota_today.warmup_day
                    ? ` · warmup d${stats.quota_today.warmup_day}`
                    : ""
                }`
              : "No Gmail connected"
          }
        />
        <StatCard
          label="Sent (7d)"
          value={stats.sent_7d.toLocaleString("id-ID")}
          icon={Activity}
        />
        <StatCard
          label="Open rate"
          value={`${openRate}%`}
          icon={Eye}
          tone="emerald"
          hint={`${stats.opened_7d} opened (7d)`}
        />
        <StatCard
          label="Reply rate"
          value={`${replyRate}%`}
          icon={MessageCircle}
          tone="blue"
          hint={`${stats.replied_7d} replied (7d)`}
        />
      </div>

      {/* KPI grid - second row: counts */}
      <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="Contacts"
          value={stats.contacts_total.toLocaleString("id-ID")}
          icon={Users}
          hint="in workspace"
        />
        <StatCard
          label="Templates"
          value={stats.templates_total.toString()}
          icon={FileText}
        />
        <StatCard
          label="Active queues"
          value={stats.queues_active.toString()}
          icon={Sparkles}
        />
        <Link href={`/w/${slug}/inbox`} className="block">
          <StatCard
            label="Pending replies"
            value={stats.pending_replies.toString()}
            icon={Inbox}
            hint={
              stats.pending_replies > 0 ? "buka inbox →" : "buka inbox"
            }
          />
        </Link>
      </div>

      {/* KPI grid - third row: deliverability */}
      <div className="mt-3.5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          label="Bounced (7d)"
          value={stats.bounced_7d.toLocaleString("id-ID")}
          icon={AlertTriangle}
          tone={stats.bounced_7d > 0 ? "red" : "default"}
          hint={
            stats.sent_7d > 0
              ? `${Math.round(
                  (stats.bounced_7d / stats.sent_7d) * 100,
                )}% bounce rate`
              : "delivery failures"
          }
        />
        <Link href={`/w/${slug}/contacts?segment=archived`} className="block">
          <StatCard
            label="Archived"
            value={stats.archived_total.toLocaleString("id-ID")}
            icon={Archive}
            hint="auto + manual"
          />
        </Link>
        <StatCard
          label="Skipped"
          value={stats.skipped_total.toLocaleString("id-ID")}
          icon={SkipForward}
          hint="dedup / inactive"
        />
        <StatCard
          label="Blocked / spam"
          value={stats.blocked_spam_7d.toLocaleString("id-ID")}
          icon={ShieldAlert}
          tone={stats.blocked_spam_7d > 0 ? "red" : "default"}
          hint="ditolak server (7d)"
        />
      </div>

      {/* Two column: Replies + Activity */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-ink">
              Recent Replies
            </h2>
            {replies.length > 0 && (
              <span className="text-xs text-muted">
                {replies.length} terbaru
              </span>
            )}
          </div>
          {replies.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="Belum ada balasan"
              description="Setelah lu kirim email dan ada yang reply, mereka muncul di sini dengan link langsung ke Gmail thread."
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-border">
                {replies.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-sunken"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {r.contact_name ?? r.contact_email}
                          {r.contact_company && (
                            <span className="ml-1.5 font-normal text-muted">
                              · {r.contact_company}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          {new Date(r.replied_at).toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </div>
                    {r.gmail_thread_id && (
                      <a
                        href={`https://mail.google.com/mail/u/0/#inbox/${r.gmail_thread_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span className="hidden sm:inline">Gmail</span>
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-ink">
            Activity
          </h2>
          {activity.length === 0 ? (
            <Card className="p-5">
              <p className="text-center text-xs text-muted">
                Belum ada aktivitas.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-border">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs"
                  >
                    <span className="text-base leading-none">
                      {activityEmoji(a.activity_type)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-secondary">
                      {describeActivity(a)}
                    </span>
                    <span className="shrink-0 text-faint">
                      {timeAgo(a.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Quick action shortcuts */}
      <div className="mt-10">
        <h2 className="mb-3 text-ink">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ShortcutCard
            href={`/w/${slug}/queues/new`}
            icon={Sparkles}
            title="New Queue"
            description="Setup auto-send"
            accent
          />
          <ShortcutCard
            href={`/w/${slug}/templates/new`}
            icon={FileText}
            title="New Template"
            description="Compose email"
          />
          <ShortcutCard
            href={`/w/${slug}/contacts/import`}
            icon={Users}
            title="Import Contacts"
            description="Upload CSV"
          />
          <ShortcutCard
            href={`/w/${slug}/pipeline`}
            icon={Activity}
            title="Pipeline"
            description="Manage stages"
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ButtonLink href={href} variant={primary ? "primary" : "secondary"} size="sm">
      {children}
    </ButtonLink>
  );
}

function ShortcutCard({
  href,
  icon: Icon,
  title,
  description,
  accent,
}: {
  href: string;
  icon: typeof Sparkles;
  title: string;
  description: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start justify-between">
        <div
          className={
            accent
              ? "grid size-9 place-items-center rounded-md bg-accent-soft text-accent-text"
              : "grid size-9 place-items-center rounded-md bg-surface-sunken text-muted"
          }
        >
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink-secondary" />
      </div>
      <p className="mt-4 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
    </Link>
  );
}

function activityEmoji(type: string): string {
  switch (type) {
    case "email_sent":
      return "📧";
    case "email_opened":
      return "👁";
    case "email_replied":
      return "💬";
    case "email_out_of_office":
      return "🌴";
    case "followup_sent":
      return "🔁";
    case "stage_changed":
      return "📋";
    default:
      return "•";
  }
}

function describeActivity(a: { activity_type: string; metadata: Record<string, unknown> }): string {
  switch (a.activity_type) {
    case "email_sent":
      return "Email sent";
    case "email_opened":
      return "Email opened";
    case "email_replied":
      return `Reply from ${(a.metadata.contact_email as string) ?? "contact"}`;
    case "email_out_of_office":
      return `${(a.metadata.contact_email as string) ?? "Contact"} sedang cuti, follow-up ditunda sampai lewat ${(a.metadata.return_date as string) ?? "tanggal kembali"}${a.metadata.date_found ? "" : " (perkiraan)"}`;
    case "followup_sent":
      return `Follow-up sent`;
    case "stage_changed":
      return `Moved to ${(a.metadata.new_stage_name as string) ?? "stage"}`;
    default:
      return a.activity_type;
  }
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}
