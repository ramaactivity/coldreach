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
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Workspace hero with color accent */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ backgroundColor: workspace.color_theme }}
        />
        <div
          className="absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-[0.06] blur-2xl"
          style={{ backgroundColor: workspace.color_theme }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: workspace.color_theme }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {workspace.business_type}
              </span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {workspace.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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

      {/* KPI grid - top row: send/perf */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sent today"
          value={stats.sent_today.toLocaleString("id-ID")}
          icon={Send}
          hint={
            stats.quota_today
              ? `${stats.quota_today.sent}/${stats.quota_today.quota} quota`
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
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          tone={stats.queues_active > 0 ? "emerald" : "default"}
        />
        <StatCard
          label="Pending replies"
          value={stats.pending_replies.toString()}
          icon={Inbox}
          tone={stats.pending_replies > 0 ? "blue" : "default"}
          hint={stats.pending_replies > 0 ? "butuh tindakan" : undefined}
        />
      </div>

      {/* Two column: Replies + Activity */}
      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Recent Replies
            </h2>
            {replies.length > 0 && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
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
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {replies.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                        <MessageCircle className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {r.contact_name ?? r.contact_email}
                          {r.contact_company && (
                            <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                              · {r.contact_company}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
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
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
          <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Activity
          </h2>
          {activity.length === 0 ? (
            <Card className="p-5">
              <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                Belum ada aktivitas.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs"
                  >
                    <span className="text-base leading-none">
                      {activityEmoji(a.activity_type)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
                      {describeActivity(a)}
                    </span>
                    <span className="shrink-0 text-zinc-400 dark:text-zinc-600">
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
        <h2 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ShortcutCard
            href={`/w/${slug}/queues/new`}
            icon={Sparkles}
            title="New Queue"
            description="Setup auto-send"
            color={workspace.color_theme}
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
    <Link
      href={href}
      className={
        primary
          ? "inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-zinc-50 shadow-sm transition-all hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          : "inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }
    >
      {children}
    </Link>
  );
}

function ShortcutCard({
  href,
  icon: Icon,
  title,
  description,
  color,
}: {
  href: string;
  icon: typeof Sparkles;
  title: string;
  description: string;
  color?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border border-zinc-200/80 bg-white p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={
            color
              ? { backgroundColor: `${color}15`, color }
              : undefined
          }
        >
          <Icon
            className="h-4 w-4"
            style={!color ? undefined : { color }}
            stroke={color ?? "currentColor"}
          />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-700 dark:group-hover:text-zinc-300" />
      </div>
      <p className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
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
