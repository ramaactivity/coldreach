"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  X,
  Star,
  Bookmark,
  Plus,
  Trash2,
  Loader2,
  Pin,
  PinOff,
  MailX,
  MessageCircle,
  AlertOctagon,
  Clock,
} from "lucide-react";
import {
  CONTACTS_SORT_OPTIONS,
  type ContactsSort,
} from "@/lib/contacts-constants";
import type { PipelineStage } from "@/lib/workspace-constants";
import { Select, SelectItem } from "@/components/ui/select";
import {
  createSavedFilter,
  deleteSavedFilter,
  toggleSavedFilterPin,
  type SavedFilter,
} from "./saved-filter-actions";

const SEGMENTS: {
  value: string;
  label: string;
  icon: typeof MailX;
  tone: "amber" | "blue" | "red" | "zinc";
}[] = [
  { value: "never_contacted", label: "Belum dikontak", icon: MailX, tone: "amber" },
  { value: "replied", label: "Pernah reply", icon: MessageCircle, tone: "blue" },
  { value: "bounced", label: "Bounced", icon: AlertOctagon, tone: "red" },
  { value: "stale_30d", label: "Stale 30+ hari", icon: Clock, tone: "zinc" },
];

const SEGMENT_TONE_CLASSES: Record<
  (typeof SEGMENTS)[number]["tone"],
  { active: string; inactive: string }
> = {
  amber: {
    active:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    inactive:
      "border-zinc-200 bg-white text-zinc-700 hover:border-amber-300 hover:bg-amber-50/60 hover:text-amber-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-amber-800 dark:hover:bg-amber-950/30 dark:hover:text-amber-400",
  },
  blue: {
    active:
      "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
    inactive:
      "border-zinc-200 bg-white text-zinc-700 hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-blue-800 dark:hover:bg-blue-950/30 dark:hover:text-blue-400",
  },
  red: {
    active:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
    inactive:
      "border-zinc-200 bg-white text-zinc-700 hover:border-red-300 hover:bg-red-50/60 hover:text-red-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-400",
  },
  zinc: {
    active:
      "border-zinc-300 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100",
    inactive:
      "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800",
  },
};

export function FiltersBar({
  slug,
  stages,
  savedFilters,
}: {
  slug: string;
  stages: PipelineStage[];
  savedFilters: SavedFilter[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [savingName, setSavingName] = useState<string | null>(null);
  const [showSaveInput, setShowSaveInput] = useState(false);

  const q = sp.get("q") ?? "";
  const tag = sp.get("tag") ?? "";
  const sort = (sp.get("sort") ?? "created_desc") as ContactsSort;
  const stage = sp.get("stage") ?? "";
  const segment = sp.get("segment") ?? "";

  const filterKeys = ["q", "tag", "sort", "stage", "segment"] as const;
  const hasFilter =
    Boolean(q || tag || stage || segment) || sort !== "created_desc";

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(`/w/${slug}/contacts${qs ? `?${qs}` : ""}`);
  }

  function applySaved(f: SavedFilter) {
    const params = new URLSearchParams();
    for (const k of filterKeys) {
      const v = f.filter_definition[k];
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    router.push(`/w/${slug}/contacts${qs ? `?${qs}` : ""}`);
  }

  function captureCurrent(): Record<string, string> {
    const def: Record<string, string> = {};
    for (const k of filterKeys) {
      const v = sp.get(k);
      if (v) def[k] = v;
    }
    return def;
  }

  function handleSave(name: string) {
    const def = captureCurrent();
    if (Object.keys(def).length === 0) return;
    startTransition(async () => {
      const res = await createSavedFilter(slug, name, def);
      if (res.ok) {
        setShowSaveInput(false);
        setSavingName(null);
        router.refresh();
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSavedFilter(slug, id);
      router.refresh();
    });
  }

  function handleTogglePin(f: SavedFilter) {
    startTransition(async () => {
      await toggleSavedFilterPin(slug, f.id, !f.is_pinned);
      router.refresh();
    });
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    pushWith({ q: (fd.get("q") as string) || null });
  }

  return (
    <div className="mb-4 space-y-3">
      {/* Smart segments */}
      <div className="flex flex-wrap gap-1.5">
        {SEGMENTS.map((s) => {
          const Icon = s.icon;
          const active = segment === s.value;
          const tone = SEGMENT_TONE_CLASSES[s.tone];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => pushWith({ segment: active ? null : s.value })}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium shadow-sm transition-all ${
                active ? tone.active : tone.inactive
              }`}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Cari nama, email (primary/alt), atau company..."
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-100"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Search
        </button>
      </form>

      {/* Sort + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[200px]">
          <Select
            value={sort}
            onValueChange={(v) => pushWith({ sort: v })}
            size="sm"
          >
            {CONTACTS_SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <div className="w-[160px]">
          <Select
            value={stage || "__all__"}
            onValueChange={(v) =>
              pushWith({ stage: v === "__all__" ? null : v })
            }
            size="sm"
            dotColor={
              stage ? stages.find((s) => s.id === stage)?.color : undefined
            }
          >
            <SelectItem value="__all__">Semua stage</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id} dotColor={s.color}>
                {s.name}
              </SelectItem>
            ))}
          </Select>
        </div>

        <input
          type="text"
          defaultValue={tag}
          placeholder="Filter tag..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pushWith({
                tag: (e.currentTarget.value || "").toLowerCase() || null,
              });
            }
          }}
          onBlur={(e) => {
            const v = (e.currentTarget.value || "").toLowerCase();
            if (v !== tag) pushWith({ tag: v || null });
          }}
          className="h-9 w-36 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder:text-zinc-600"
        />

        {q && (
          <Chip onClear={() => pushWith({ q: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">cari:</span> {q}
          </Chip>
        )}
        {tag && (
          <Chip onClear={() => pushWith({ tag: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">tag:</span> {tag}
          </Chip>
        )}
        {stage && (
          <Chip onClear={() => pushWith({ stage: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">stage:</span>{" "}
            {stages.find((s) => s.id === stage)?.name ?? stage}
          </Chip>
        )}

        <span className="grow" />

        {hasFilter && !showSaveInput && (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <Bookmark className="h-3 w-3" />
            Simpan filter
          </button>
        )}

        {hasFilter && (
          <button
            type="button"
            onClick={() =>
              pushWith({
                q: null,
                tag: null,
                stage: null,
                sort: null,
                segment: null,
              })
            }
            className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-3 w-3" />
            Reset all
          </button>
        )}
      </div>

      {/* Save filter inline form */}
      {showSaveInput && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 dark:border-blue-900/50 dark:bg-blue-950/20">
          <Bookmark className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <input
            type="text"
            value={savingName ?? ""}
            onChange={(e) => setSavingName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && savingName) handleSave(savingName);
              if (e.key === "Escape") {
                setShowSaveInput(false);
                setSavingName(null);
              }
            }}
            autoFocus
            placeholder="Nama filter (e.g., HR Bogor stale)"
            className="h-7 flex-1 rounded-md border border-blue-200 bg-white px-2 text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            disabled={!savingName?.trim() || pending}
            onClick={() => savingName && handleSave(savingName)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
            Simpan
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSaveInput(false);
              setSavingName(null);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-700 transition-colors hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Saved filters row */}
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Star className="h-3 w-3" />
            Saved
          </span>
          {savedFilters.map((f) => (
            <SavedFilterChip
              key={f.id}
              filter={f}
              onApply={() => applySaved(f)}
              onDelete={() => handleDelete(f.id)}
              onTogglePin={() => handleTogglePin(f)}
              pending={pending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedFilterChip({
  filter,
  onApply,
  onDelete,
  onTogglePin,
  pending,
}: {
  filter: SavedFilter;
  onApply: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  pending: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group inline-flex h-7 items-center overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <button
        type="button"
        onClick={onApply}
        className="flex h-full items-center gap-1.5 px-3 text-xs font-medium text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
      >
        {filter.is_pinned && (
          <Pin className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
        )}
        {filter.name}
      </button>
      {hover && (
        <div className="flex h-full items-center border-l border-zinc-200 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-800/40">
          <button
            type="button"
            disabled={pending}
            onClick={onTogglePin}
            title={filter.is_pinned ? "Unpin" : "Pin"}
            className="flex h-full w-6 items-center justify-center text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          >
            {filter.is_pinned ? (
              <PinOff className="h-3 w-3" />
            ) : (
              <Pin className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onDelete}
            title="Hapus"
            className="flex h-full w-6 items-center justify-center text-zinc-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  onClear,
  children,
}: {
  onClear: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-zinc-100 px-2.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
      <button
        type="button"
        onClick={onClear}
        className="-mr-1 ml-0.5 rounded-full p-0.5 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
        aria-label="Clear"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
