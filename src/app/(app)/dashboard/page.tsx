import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Send,
  TrendingUp,
  MessageCircle,
  Inbox,
  ArrowUpRight,
  Plus,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";
import {
  getWorkspaceStats,
  getRecentReplies,
  getDailySeries,
} from "@/lib/stats";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Sparkline, MiniBars, RadialGauge } from "@/components/ui/chart";
import { HolidayNotice } from "@/components/holiday-notice";
import { accentFromColorTheme } from "@/lib/workspace-constants";
import { cn } from "@/lib/utils";

const DAYS = 7;

export default async function DashboardPage() {
  const user = await requireCurrentUser();
  const workspaces = await getUserWorkspaces();

  if (workspaces.length === 0) {
    redirect("/onboarding/workspace");
  }
  if (workspaces.length === 1) {
    redirect(`/w/${workspaces[0].slug}/dashboard`);
  }

  const [allStats, allSeries, recentReplies] = await Promise.all([
    Promise.all(workspaces.map((w) => getWorkspaceStats(w.id))),
    Promise.all(workspaces.map((w) => getDailySeries(w.id, DAYS))),
    getRecentReplies(null, 10),
  ]);

  const totals = allStats.reduce(
    (acc, s) => ({
      sent_today: acc.sent_today + s.sent_today,
      sent_7d: acc.sent_7d + s.sent_7d,
      replied_7d: acc.replied_7d + s.replied_7d,
      pending_replies: acc.pending_replies + s.pending_replies,
    }),
    { sent_today: 0, sent_7d: 0, replied_7d: 0, pending_replies: 0 },
  );

  // Element-wise sum of the per-workspace daily series → aggregate trend.
  const aggSent = Array.from({ length: DAYS }, (_, i) =>
    allSeries.reduce((sum, ser) => sum + (ser[i]?.sent ?? 0), 0),
  );
  const aggReplied = Array.from({ length: DAYS }, (_, i) =>
    allSeries.reduce((sum, ser) => sum + (ser[i]?.replied ?? 0), 0),
  );

  const replyRate7d =
    totals.sent_7d > 0
      ? Math.round((totals.replied_7d / totals.sent_7d) * 100)
      : 0;

  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader
          eyebrow={
            <>
              <Sparkles className="h-3 w-3 text-muted" />
              <span>{workspaces.length} workspaces</span>
            </>
          }
          title="Semua Workspace"
          description="Aggregate view dari semua bisnis lu. Klik workspace untuk masuk lebih detail."
        />

        <HolidayNotice />

        {/* Aggregate KPIs — number + 7-day trend */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Sent today"
            value={totals.sent_today}
            icon={Send}
            spark={aggSent}
          />
          <KpiCard
            label="Sent (7d)"
            value={totals.sent_7d}
            icon={TrendingUp}
            spark={aggSent}
          />
          <KpiCard
            label="Replied (7d)"
            value={totals.replied_7d}
            icon={MessageCircle}
            tone="info"
            spark={aggReplied}
            hint={replyRate7d > 0 ? `${replyRate7d}% reply rate` : undefined}
          />
          <KpiCard
            label="Pending replies"
            value={totals.pending_replies}
            icon={Inbox}
            href="/inbox"
            cta={totals.pending_replies > 0 ? "buka inbox →" : "inbox kosong"}
            highlight={totals.pending_replies > 0}
          />
        </div>

        {/* Workspaces — quota gauge + send trend per business */}
        <h2 className="mb-3 mt-10 text-ink">Workspaces</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws, i) => {
            const s = allStats[i];
            const sentSeries = allSeries[i].map((d) => d.sent);
            const quotaSent = s.quota_today?.sent ?? s.sent_today;
            const quotaMax = s.quota_today?.quota ?? ws.daily_target;
            return (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}/dashboard`}
                data-accent={accentFromColorTheme(ws.color_theme)}
                className="group flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <div className="flex items-start justify-between">
                  <span className="label-eyebrow flex items-center gap-1.5 text-accent-text">
                    <span className="inline-block size-1.5 rounded-full bg-accent" />
                    {ws.business_type ?? "—"}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink-secondary" />
                </div>

                <div>
                  <h3 className="text-[15px] font-semibold text-ink">
                    {ws.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted">
                    {ws.schedule_start_time.slice(0, 5)} –{" "}
                    {ws.schedule_end_time.slice(0, 5)} WIB · {ws.daily_target}
                    /hari
                  </p>
                </div>

                {/* Quota gauge + 7-day send trend */}
                <div className="flex items-center gap-4">
                  <RadialGauge value={quotaSent} max={quotaMax} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="label-eyebrow text-faint">Sent · 7d</span>
                    <MiniBars data={sentSeries} className="w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
                  <Mini label="Today" value={s.sent_today} />
                  <Mini label="7d sent" value={s.sent_7d} />
                  <Mini label="Replied" value={s.replied_7d} tone="info" />
                </div>

                {s.queues_active > 0 && (
                  <span className="flex items-center gap-2 text-xs font-medium text-success-text">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-success" />
                    </span>
                    {s.queues_active} active queue{s.queues_active > 1 ? "s" : ""}
                  </span>
                )}
              </Link>
            );
          })}

          <Link
            href="/onboarding/workspace"
            className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken p-5 text-muted transition-colors hover:border-action hover:text-ink"
          >
            <Plus className="h-5 w-5" />
            <span className="text-sm font-medium">Tambah Workspace</span>
          </Link>
        </div>

        {/* Recent replies */}
        <div className="mb-3 mt-10 flex items-center justify-between">
          <h2 className="text-ink">Recent Replies</h2>
          <span className="text-xs text-muted">
            {recentReplies.length > 0 ? `${recentReplies.length} terbaru` : "—"}
          </span>
        </div>

        {recentReplies.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="Belum ada balasan"
            description="Setelah lu kirim email pertama dan ada yang reply, mereka muncul di sini dengan link langsung ke Gmail thread."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {recentReplies.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-hover"
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
                        {r.workspace_name && `${r.workspace_name} · `}
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
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Buka di Gmail</span>
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  spark,
  tone = "ink",
  hint,
  href,
  cta,
  highlight,
}: {
  label: string;
  value: number;
  icon: typeof Send;
  spark?: number[];
  tone?: "ink" | "info";
  hint?: string;
  href?: string;
  cta?: string;
  highlight?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col rounded-lg border bg-surface p-5 transition-colors",
        highlight ? "border-accent-border" : "border-border",
        href && "hover:border-border-strong",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="label-eyebrow">{label}</span>
        <span
          className={cn(
            "grid size-8 place-items-center rounded-md",
            highlight ? "bg-accent-soft text-accent-text" : "bg-surface-sunken text-muted",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p
        className={cn(
          "mt-3 text-3xl font-semibold leading-none tabular",
          tone === "info" ? "text-info" : "text-ink",
        )}
      >
        {value.toLocaleString("id-ID")}
      </p>
      <div className="mt-3 flex-1">
        {spark && spark.some((v) => v > 0) ? (
          <Sparkline data={spark} />
        ) : null}
      </div>
      {(hint || cta) && (
        <p
          className={cn(
            "mt-1 text-[13px]",
            highlight ? "font-medium text-accent-text" : "text-muted",
          )}
        >
          {cta ?? hint}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info";
}) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-lg font-semibold tabular tracking-tight",
          tone === "info" ? "text-info" : "text-ink",
        )}
      >
        {value.toLocaleString("id-ID")}
      </p>
    </div>
  );
}
