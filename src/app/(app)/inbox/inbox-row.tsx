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
import type { PipelineStage } from "@/lib/workspace-constants";
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
      } hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase text-white shadow-sm ring-2 ring-white dark:ring-zinc-900"
          style={{ backgroundColor: item.workspace_color }}
        >
          {initial}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {displayName}
            </p>
            {showWorkspace && item.workspace_name && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                style={{ borderLeft: `2px solid ${item.workspace_color}` }}
              >
                {item.workspace_name}
              </span>
            )}
            {tab === "snoozed" && item.snoozed_until && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-400">
                <AlarmClock className="h-2.5 w-2.5" />
                {formatUntil(item.snoozed_until)}
              </span>
            )}
            {tab === "handled" && item.handled_at && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Handled {formatRelative(item.handled_at)}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {item.contact_company && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {item.contact_company}
                {item.contact_position && (
                  <span className="text-zinc-400 dark:text-zinc-500">
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
            <div className="relative inline-flex items-center">
              {stage && (
                <span
                  className="pointer-events-none absolute left-2.5 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
              )}
              <select
                value={stageId}
                onChange={(e) => onStageChange(e.target.value)}
                disabled={pending || stages.length === 0}
                className={`h-7 rounded-md border border-zinc-200 bg-white text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 ${
                  stage ? "pl-6 pr-2" : "px-2"
                }`}
              >
                <option value="" disabled>
                  Pilih stage
                </option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View contact */}
            {item.workspace_slug && (
              <a
                href={`/w/${item.workspace_slug}/contacts/${item.contact_id}`}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
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
                className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
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
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-600 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
                  >
                    <AlarmClock className="h-3 w-3" />
                    Snooze
                  </button>
                  {showSnooze && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => onSnooze(opt.hours)}
                          className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
                className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
