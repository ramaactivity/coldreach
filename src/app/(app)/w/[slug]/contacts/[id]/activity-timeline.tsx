import {
  Send,
  Eye,
  MessageCircle,
  CheckCircle2,
  Repeat,
  ArrowRightLeft,
  Beaker,
  Activity,
  Clock,
} from "lucide-react";
import type { TimelineEvent, TimelineEventType } from "@/lib/contact-activity";

const ICON_BY_TYPE: Record<
  TimelineEventType,
  { icon: typeof Send; bg: string; fg: string }
> = {
  sent: {
    icon: Send,
    bg: "bg-surface-sunken",
    fg: "text-muted",
  },
  opened: {
    icon: Eye,
    bg: "bg-success-soft",
    fg: "text-success",
  },
  replied: {
    icon: MessageCircle,
    bg: "bg-info-soft",
    fg: "text-info",
  },
  handled: {
    icon: CheckCircle2,
    bg: "bg-success-soft",
    fg: "text-success",
  },
  followup_sent: {
    icon: Repeat,
    bg: "bg-warning-soft",
    fg: "text-warning",
  },
  stage_changed: {
    icon: ArrowRightLeft,
    bg: "bg-purple-50",
    fg: "text-purple-600",
  },
  test_sent: {
    icon: Beaker,
    bg: "bg-info-soft",
    fg: "text-info",
  },
};

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-sunken text-muted">
            <Activity className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-ink">
            Activity Timeline
          </h3>
        </div>
        <span className="text-xs text-muted">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface-sunken">
            <Clock className="h-4 w-4 text-faint" />
          </div>
          <p className="text-sm font-medium text-ink">
            Belum ada aktivitas
          </p>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Setelah lu kirim email atau ubah stage, riwayatnya muncul di sini
            secara otomatis.
          </p>
        </div>
      ) : (
        <ol className="relative px-5 py-4">
          <span
            aria-hidden="true"
            className="absolute left-[1.875rem] top-4 bottom-4 w-px bg-surface-hover"
          />
          {events.map((ev, i) => {
            const cfg = ICON_BY_TYPE[ev.type];
            const Icon = cfg.icon;
            return (
              <li
                key={`${ev.type}-${ev.at}-${i}`}
                className="relative flex gap-3 pb-4 last:pb-0"
              >
                <div
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${cfg.bg}`}
                >
                  <Icon className={`h-3.5 w-3.5 ${cfg.fg}`} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-medium text-ink">
                      {ev.label}
                    </p>
                    <span
                      title={formatAbsolute(ev.at)}
                      className="text-xs tabular text-muted"
                    >
                      {formatRelative(ev.at)}
                    </span>
                  </div>
                  {ev.detail && (
                    <p className="mt-0.5 text-xs text-muted">
                      {ev.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
