"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, ArrowDownWideNarrow } from "lucide-react";
import {
  CONTACTS_SORT_OPTIONS,
  type ContactsSort,
} from "@/lib/contacts-constants";
import type { PipelineStage } from "@/lib/workspace-constants";

export function FiltersBar({
  slug,
  stages,
}: {
  slug: string;
  stages: PipelineStage[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const q = sp.get("q") ?? "";
  const tag = sp.get("tag") ?? "";
  const sort = (sp.get("sort") ?? "created_desc") as ContactsSort;
  const stage = sp.get("stage") ?? "";

  const hasFilter = Boolean(q || tag || stage) || sort !== "created_desc";

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page"); // reset paging on filter change
    const qs = params.toString();
    router.push(`/w/${slug}/contacts${qs ? `?${qs}` : ""}`);
  }

  function onSearchSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    pushWith({ q: (fd.get("q") as string) || null });
  }

  return (
    <div className="mb-4 space-y-3">
      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Cari nama, email, atau company..."
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

      <div className="flex flex-wrap items-center gap-2">
        {/* Sort */}
        <div className="relative">
          <ArrowDownWideNarrow className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <select
            value={sort}
            onChange={(e) => pushWith({ sort: e.target.value })}
            className="h-9 rounded-lg border border-zinc-200 bg-white pl-8 pr-7 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {CONTACTS_SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Stage filter */}
        <select
          value={stage}
          onChange={(e) => pushWith({ stage: e.target.value || null })}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 pr-7 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <option value="">Semua stage</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Tag filter */}
        <input
          type="text"
          defaultValue={tag}
          placeholder="Filter tag..."
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              pushWith({ tag: (e.currentTarget.value || "").toLowerCase() || null });
            }
          }}
          onBlur={(e) => {
            const v = (e.currentTarget.value || "").toLowerCase();
            if (v !== tag) pushWith({ tag: v || null });
          }}
          className="h-9 w-36 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder:text-zinc-600"
        />

        {/* Active chips */}
        {q && (
          <Chip onClear={() => pushWith({ q: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">cari:</span>{" "}
            {q}
          </Chip>
        )}
        {tag && (
          <Chip onClear={() => pushWith({ tag: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">tag:</span>{" "}
            {tag}
          </Chip>
        )}
        {stage && (
          <Chip onClear={() => pushWith({ stage: null })}>
            <span className="text-zinc-500 dark:text-zinc-400">stage:</span>{" "}
            {stages.find((s) => s.id === stage)?.name ?? stage}
          </Chip>
        )}

        {hasFilter && (
          <button
            type="button"
            onClick={() =>
              pushWith({ q: null, tag: null, stage: null, sort: null })
            }
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-3 w-3" />
            Reset all
          </button>
        )}
      </div>
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
