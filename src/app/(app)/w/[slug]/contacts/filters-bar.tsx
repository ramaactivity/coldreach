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
  Archive,
  ShieldQuestion,
  ShieldAlert,
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
  { value: "unverified", label: "Belum diverifikasi", icon: ShieldQuestion, tone: "zinc" },
  { value: "risky", label: "Email berisiko", icon: ShieldAlert, tone: "red" },
  { value: "archived", label: "Archived", icon: Archive, tone: "zinc" },
];

const SEGMENT_TONE_CLASSES: Record<
  (typeof SEGMENTS)[number]["tone"],
  { active: string; inactive: string }
> = {
  amber: {
    active:
      "border-warning bg-warning-soft text-warning-text",
    inactive:
      "border-border bg-surface text-ink-secondary hover:border-warning hover:bg-warning-soft hover:text-warning-text",
  },
  blue: {
    active:
      "border-info bg-info-soft text-info-text",
    inactive:
      "border-border bg-surface text-ink-secondary hover:border-info hover:bg-info-soft hover:text-info-text",
  },
  red: {
    active:
      "border-danger bg-danger-soft text-danger-text",
    inactive:
      "border-border bg-surface text-ink-secondary hover:border-danger hover:bg-danger-soft hover:text-danger-text",
  },
  zinc: {
    active:
      "border-border-strong bg-surface-sunken text-ink",
    inactive:
      "border-border bg-surface text-ink-secondary hover:border-border-strong hover:bg-surface-sunken",
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
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all ${
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Cari nama, email (primary/alt), atau company..."
            className="h-10 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
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
          className="h-9 w-36 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-secondary placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
        />

        {q && (
          <Chip onClear={() => pushWith({ q: null })}>
            <span className="text-muted">cari:</span> {q}
          </Chip>
        )}
        {tag && (
          <Chip onClear={() => pushWith({ tag: null })}>
            <span className="text-muted">tag:</span> {tag}
          </Chip>
        )}
        {stage && (
          <Chip onClear={() => pushWith({ stage: null })}>
            <span className="text-muted">stage:</span>{" "}
            {stages.find((s) => s.id === stage)?.name ?? stage}
          </Chip>
        )}

        <span className="grow" />

        {hasFilter && !showSaveInput && (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
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
            className="inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <X className="h-3 w-3" />
            Reset all
          </button>
        )}
      </div>

      {/* Save filter inline form */}
      {showSaveInput && (
        <div className="flex items-center gap-2 rounded-lg border border-info-soft bg-info-soft/50 px-3 py-2">
          <Bookmark className="h-3.5 w-3.5 shrink-0 text-info" />
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
            className="h-7 flex-1 rounded-md border border-info-soft bg-surface px-2 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />
          <button
            type="button"
            disabled={!savingName?.trim() || pending}
            onClick={() => savingName && handleSave(savingName)}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
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
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-info transition-colors hover:bg-info-soft"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Saved filters row */}
      {savedFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
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
      className="group inline-flex h-7 items-center overflow-hidden rounded-full border border-border bg-surface transition-all hover:border-border-strong"
    >
      <button
        type="button"
        onClick={onApply}
        className="flex h-full items-center gap-1.5 px-3 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
      >
        {filter.is_pinned && (
          <Pin className="h-2.5 w-2.5 text-warning" />
        )}
        {filter.name}
      </button>
      {hover && (
        <div className="flex h-full items-center border-l border-border bg-surface-sunken">
          <button
            type="button"
            disabled={pending}
            onClick={onTogglePin}
            title={filter.is_pinned ? "Unpin" : "Pin"}
            className="flex h-full w-6 items-center justify-center text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
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
            className="flex h-full w-6 items-center justify-center text-muted transition-colors hover:bg-danger-soft hover:text-danger"
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
    <span className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-sunken px-2.5 text-xs font-medium text-ink-secondary">
      {children}
      <button
        type="button"
        onClick={onClear}
        className="-mr-1 ml-0.5 rounded-full p-0.5 text-muted transition-colors hover:bg-surface-hover hover:text-ink"
        aria-label="Clear"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
