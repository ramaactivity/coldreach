"use client";

import { useState, useTransition } from "react";
import {
  ExternalLink,
  CheckCircle2,
  Clock,
  Mail,
  Building2,
  RotateCcw,
  Loader2,
  AlarmClock,
} from "lucide-react";
import type { InboxItem, InboxTab } from "@/lib/inbox";
import {
  accentFromColorTheme,
  type PipelineStage,
} from "@/lib/workspace-constants";
import { Select, SelectItem } from "@/components/ui/select";
import {
  markHandled,
  unmarkHandled,
  snoozeReply,
  unsnooze,
  updateInboxStage,
} from "./actions";

type Props = {
  item: InboxItem;
  stages: PipelineStage[];
  tab: InboxTab;
  slug: string | null;
  showWorkspace: boolean;
};

const SNOOZE_OPTIONS = [
  { label: "1 jam", hours: 1 },
  { label: "4 jam", hours: 4 },
  { label: "Besok pagi", hours: 16 },
  { label: "3 hari", hours: 72 },
  { label: "1 minggu", hours: 168 },
];

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

function formatUntil(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return "siap";
  const hr = Math.floor(diffMs / 3_600_000);
  if (hr < 1) {
    const min = Math.max(1, Math.floor(diffMs / 60_000));
    return `${min} menit lagi`;
  }
  if (hr < 24) return `${hr} jam lagi`;
  const day = Math.floor(hr / 24);
  return `${day} hari lagi`;
}

export function InboxRow({ item, stages, tab, slug, showWorkspace }: Props) {
  const [pending, startTransition] = useTransition();
  const [stageId, setStageId] = useState<string>(item.lead_stage_id ?? "");
  const [showSnooze, setShowSnooze] = useState(false);

  const stage = stages.find((s) => s.id === stageId);
  const displayName = item.contact_name ?? item.contact_email;
  const initial = (item.contact_name ?? item.contact_email)[0]?.toUpperCase() ?? "?";

  const gmailUrl = item.gmail_thread_id
    ? `https://mail.google.com/mail/u/0/#inbox/${item.gmail_thread_id}`
    : null;

  function onStageChange(newId: string) {
    setStageId(newId);
    startTransition(async () => {
      await updateInboxStage(item.contact_id, item.workspace_id, newId, slug);
    });
  }

  function onMarkHandled() {
    startTransition(async () => {
      await markHandled(item.id, slug);
    });
  }

  function onUnmark() {
    startTransition(async () => {
      await unmarkHandled(item.id, slug);
    });
  }

  function onSnooze(hours: number) {
    setShowSnooze(false);
    startTransition(async () => {
      await snoozeReply(item.id, hours, slug);
    });
  }

  function onUnsnooze() {
    startTransition(async () => {
      await unsnooze(item.id, slug);
    });
  }

  return (
    <li
      className={`group relative px-5 py-4 transition-all ${
        pending ? "opacity-60" : ""
      } hover:bg-surface-sunken/80`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          data-accent={accentFromColorTheme(item.workspace_color)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-accent-fg ring-2 ring-surface"
        >
          {initial}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-ink">
              {displayName}
            </p>
            {showWorkspace && item.workspace_name && (
              <span
                data-accent={accentFromColorTheme(item.workspace_color)}
                className="inline-flex items-center gap-1 rounded-full border-l-2 border-l-accent bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted"
              >
                {item.workspace_name}
              </span>
            )}
            {tab === "snoozed" && item.snoozed_until && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning-text">
                <AlarmClock className="h-2.5 w-2.5" />
                {formatUntil(item.snoozed_until)}
              </span>
            )}
            {tab === "handled" && item.handled_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success-text">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Handled {formatRelative(item.handled_at)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {item.contact_company && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {item.contact_company}
                {item.contact_position && (
                  <span className="text-faint">
                    · {item.contact_position}
                  </span>
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {item.contact_email}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Reply {formatRelative(item.replied_at)}
            </span>
          </div>

          {/* Stage selector + actions row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-[160px]">
              <Select
                value={stageId}
                onValueChange={onStageChange}
                disabled={pending || stages.length === 0}
                size="sm"
                placeholder="Pilih stage"
                dotColor={stage?.color}
              >
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id} dotColor={s.color}>
                    {s.name}
                  </SelectItem>
                ))}
              </Select>
            </div>

            {/* View contact */}
            {item.workspace_slug && (
              <a
                href={`/w/${item.workspace_slug}/contacts/${item.contact_id}`}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                Detail
              </a>
            )}

            {/* Open in Gmail */}
            {gmailUrl && (
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <ExternalLink className="h-3 w-3" />
                Gmail
              </a>
            )}

            <span className="grow" />

            {/* Tab-specific actions */}
            {tab === "pending" && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowSnooze((v) => !v)}
                    disabled={pending}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                  >
                    <AlarmClock className="h-3 w-3" />
                    Snooze
                  </button>
                  {showSnooze && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => onSnooze(opt.hours)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-ink-secondary transition-colors hover:bg-surface-sunken"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onMarkHandled}
                  disabled={pending}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Mark Handled
                </button>
              </>
            )}

            {tab === "snoozed" && (
              <button
                type="button"
                onClick={onUnsnooze}
                disabled={pending}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
              >
                <RotateCcw className="h-3 w-3" />
                Unsnooze
              </button>
            )}

            {tab === "handled" && (
              <button
                type="button"
                onClick={onUnmark}
                disabled={pending}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
              >
                <RotateCcw className="h-3 w-3" />
                Re-open
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
