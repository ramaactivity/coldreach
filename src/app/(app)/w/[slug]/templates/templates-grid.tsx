"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Paperclip,
  ArrowUpRight,
  Send,
  Eye,
  MessageCircle,
  Sparkles,
  Clock,
} from "lucide-react";
import type { TemplateWithAttachments } from "@/lib/templates";
import type { TemplateStats } from "@/lib/templates";
import { Select, SelectItem } from "@/components/ui/select";

type SortKey =
  | "recently_used"
  | "most_sent"
  | "highest_reply_rate"
  | "highest_open_rate"
  | "name_asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recently_used", label: "Terakhir dipakai" },
  { value: "most_sent", label: "Paling banyak terkirim" },
  { value: "highest_reply_rate", label: "Reply rate tertinggi" },
  { value: "highest_open_rate", label: "Open rate tertinggi" },
  { value: "name_asc", label: "Nama A → Z" },
];

const ZERO_STATS: TemplateStats = {
  template_id: "",
  sent_count: 0,
  opened_count: 0,
  replied_count: 0,
  last_used_at: null,
  open_rate: 0,
  reply_rate: 0,
};

function formatRate(rate: number): string {
  if (rate === 0) return "—";
  return `${(rate * 100).toFixed(rate >= 0.1 ? 0 : 1)}%`;
}

function rateColor(rate: number): string {
  if (rate >= 0.15) return "text-success";
  if (rate >= 0.05) return "text-info";
  if (rate > 0) return "text-warning";
  return "text-faint";
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const day = Math.floor(diffMs / (24 * 3600 * 1000));
  if (day < 1) {
    const hr = Math.floor(diffMs / 3600_000);
    if (hr < 1) return "baru saja";
    return `${hr} jam lalu`;
  }
  if (day < 7) return `${day} hari lalu`;
  if (day < 30) return `${Math.floor(day / 7)} minggu lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TemplatesGrid({
  slug,
  templates,
  stats,
}: {
  slug: string;
  templates: TemplateWithAttachments[];
  stats: Map<string, TemplateStats>;
}) {
  const [sortBy, setSortBy] = useState<SortKey>("recently_used");

  const sorted = useMemo(() => {
    const arr = [...templates];
    arr.sort((a, b) => {
      const sa = stats.get(a.id) ?? ZERO_STATS;
      const sb = stats.get(b.id) ?? ZERO_STATS;
      switch (sortBy) {
        case "recently_used": {
          const tA = sa.last_used_at ? new Date(sa.last_used_at).getTime() : 0;
          const tB = sb.last_used_at ? new Date(sb.last_used_at).getTime() : 0;
          if (tA !== tB) return tB - tA;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }
        case "most_sent":
          return sb.sent_count - sa.sent_count;
        case "highest_reply_rate":
          // prioritize templates with at least 10 sends to avoid noise
          if (sa.sent_count < 10 && sb.sent_count >= 10) return 1;
          if (sb.sent_count < 10 && sa.sent_count >= 10) return -1;
          return sb.reply_rate - sa.reply_rate;
        case "highest_open_rate":
          if (sa.sent_count < 10 && sb.sent_count >= 10) return 1;
          if (sb.sent_count < 10 && sa.sent_count >= 10) return -1;
          return sb.open_rate - sa.open_rate;
        case "name_asc":
          return a.name.localeCompare(b.name);
      }
    });
    return arr;
  }, [templates, stats, sortBy]);

  const aggregateStats = useMemo(() => {
    let totalSent = 0;
    let totalOpened = 0;
    let totalReplied = 0;
    for (const t of templates) {
      const s = stats.get(t.id);
      if (s) {
        totalSent += s.sent_count;
        totalOpened += s.opened_count;
        totalReplied += s.replied_count;
      }
    }
    return {
      totalSent,
      totalOpened,
      totalReplied,
      openRate: totalSent > 0 ? totalOpened / totalSent : 0,
      replyRate: totalSent > 0 ? totalReplied / totalSent : 0,
    };
  }, [templates, stats]);

  return (
    <>
      {/* Aggregate KPI strip */}
      {aggregateStats.totalSent > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KPI
            label="Total terkirim"
            value={aggregateStats.totalSent.toLocaleString("id-ID")}
            icon={Send}
          />
          <KPI
            label="Total dibuka"
            value={aggregateStats.totalOpened.toLocaleString("id-ID")}
            icon={Eye}
            tone="blue"
          />
          <KPI
            label="Open rate"
            value={formatRate(aggregateStats.openRate)}
            icon={Eye}
            tone="blue"
          />
          <KPI
            label="Reply rate"
            value={formatRate(aggregateStats.replyRate)}
            icon={MessageCircle}
            tone="emerald"
          />
        </div>
      )}

      {/* Sort */}
      <div className="mb-4 flex items-center justify-end">
        <div className="w-[220px]">
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortKey)}
            size="sm"
          >
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {sorted.map((t) => {
          const s = stats.get(t.id) ?? ZERO_STATS;
          const hasData = s.sent_count > 0;
          return (
            <Link
              key={t.id}
              href={`/w/${slug}/templates/${t.id}`}
              className="group relative overflow-hidden rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-ink">
                      {t.name}
                    </h2>
                    {t.attachments.length > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-muted">
                        <Paperclip className="h-2.5 w-2.5" />
                        {t.attachments.length}
                      </span>
                    )}
                  </div>
                  {t.category && (
                    <p className="mt-0.5 text-xs text-muted">
                      {t.category}
                    </p>
                  )}
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink-secondary" />
              </div>

              <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted">
                {t.subject_lines[0] ?? "(no subject)"}
              </p>

              {/* Stats row — prominent if data exists */}
              {hasData ? (
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
                  <Stat
                    label="Sent"
                    value={s.sent_count.toLocaleString("id-ID")}
                    icon={Send}
                  />
                  <Stat
                    label="Open rate"
                    value={formatRate(s.open_rate)}
                    icon={Eye}
                    valueColor={rateColor(s.open_rate)}
                  />
                  <Stat
                    label="Reply rate"
                    value={formatRate(s.reply_rate)}
                    icon={MessageCircle}
                    valueColor={rateColor(s.reply_rate)}
                  />
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted">
                  <Sparkles className="h-3 w-3" />
                  <span>Belum dipakai — pasangin ke queue dulu</span>
                </div>
              )}

              {/* Footer meta */}
              <div className="mt-3 flex items-center justify-between text-[10px] text-muted">
                <span>
                  {t.subject_lines.length} subject{" "}
                  {t.subject_lines.length > 1 ? "variants" : "variant"}
                </span>
                {s.last_used_at && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatRelative(s.last_used_at)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function KPI({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: typeof Send;
  tone?: "default" | "emerald" | "blue";
}) {
  const colors = {
    default: "text-ink",
    emerald: "text-success",
    blue: "text-info",
  };
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-faint" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          {label}
        </p>
      </div>
      <p className={`mt-1.5 text-xl font-semibold tabular tracking-tight ${colors[tone]}`}>
        {value}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: typeof Send;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        <Icon className="h-2.5 w-2.5" />
        {label}
      </div>
      <p
        className={`mt-0.5 text-sm font-semibold tabular ${
          valueColor ?? "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
