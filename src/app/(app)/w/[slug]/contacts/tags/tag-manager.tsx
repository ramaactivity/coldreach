"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Tag,
  Edit3,
  Trash2,
  GitMerge,
  Search,
  X,
  Loader2,
  Check,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import type { TagUsage } from "@/lib/tags";
import { renameTag, mergeTags, deleteTag } from "./actions";

type Mode = null | { type: "rename"; tag: string } | { type: "delete"; tag: string };

export function TagManager({
  slug,
  initial,
}: {
  slug: string;
  initial: TagUsage[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergeTarget, setMergeTarget] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [feedback, setFeedback] = useState<
    | { type: "ok"; msg: string }
    | { type: "err"; msg: string }
    | null
  >(null);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return initial;
    return initial.filter((t) => t.tag.includes(f));
  }, [initial, filter]);

  function showFlash(type: "ok" | "err", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  }

  function toggleOne(tag: string) {
    const next = new Set(selected);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
    setShowMerge(false);
    setMergeTarget("");
  }

  function startRename(tag: string) {
    setMode({ type: "rename", tag });
    setRenameValue(tag);
  }

  function commitRename() {
    if (mode?.type !== "rename") return;
    const oldName = mode.tag;
    const newName = renameValue.trim();
    startTransition(async () => {
      const res = await renameTag(slug, oldName, newName);
      if (res.ok) {
        showFlash("ok", `${res.affected} kontak ter-update`);
        setMode(null);
        router.refresh();
      } else {
        showFlash("err", res.error);
      }
    });
  }

  function commitDelete() {
    if (mode?.type !== "delete") return;
    const tag = mode.tag;
    startTransition(async () => {
      const res = await deleteTag(slug, tag);
      if (res.ok) {
        showFlash("ok", `Tag "${tag}" dihapus dari ${res.affected} kontak`);
        setMode(null);
        router.refresh();
      } else {
        showFlash("err", res.error);
      }
    });
  }

  function commitMerge() {
    const target = mergeTarget.trim();
    if (!target) return;
    const sources = Array.from(selected);
    startTransition(async () => {
      const res = await mergeTags(slug, sources, target);
      if (res.ok) {
        showFlash(
          "ok",
          `${sources.length} tag di-merge → "${target}" (${res.affected} kontak)`,
        );
        clearSelection();
        router.refresh();
      } else {
        showFlash("err", res.error);
      }
    });
  }

  if (initial.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300/70 bg-zinc-50/40 px-6 py-14 text-center dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
          <Tag className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Belum ada tag
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Tambah tag dari edit kontak atau bulk-action di list contacts.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Filter input */}
      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={`Cari di antara ${initial.length} tag...`}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>

      {/* Tag list */}
      <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200/80 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {filtered.length} tag
          </p>
          {selected.size > 0 && (
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {selected.size} dipilih untuk merge
            </span>
          )}
        </div>

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {filtered.map((t) => {
            const isSel = selected.has(t.tag);
            const isRenaming = mode?.type === "rename" && mode.tag === t.tag;
            const isDeleting = mode?.type === "delete" && mode.tag === t.tag;
            return (
              <li
                key={t.tag}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${
                  isSel
                    ? "bg-blue-50/50 dark:bg-blue-950/10"
                    : "hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  onChange={() => toggleOne(t.tag)}
                  className="h-4 w-4 cursor-pointer rounded border-zinc-300 bg-white text-zinc-900 shadow-sm focus:ring-2 focus:ring-zinc-900/30 focus:ring-offset-0 dark:border-zinc-600 dark:bg-zinc-800"
                />

                {isRenaming ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setMode(null);
                      }}
                      autoFocus
                      className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={commitRename}
                      disabled={pending || !renameValue.trim()}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      {pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode(null)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : isDeleting ? (
                  <div className="flex flex-1 items-center gap-2 rounded-md bg-red-50 px-2.5 py-1 dark:bg-red-950/30">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
                    <p className="flex-1 text-xs text-red-700 dark:text-red-400">
                      Hapus tag <strong>{t.tag}</strong> dari{" "}
                      {t.contact_count} kontak?
                    </p>
                    <button
                      type="button"
                      onClick={commitDelete}
                      disabled={pending}
                      className="inline-flex h-6 items-center gap-1 rounded-md border border-red-200 bg-white px-2 text-[11px] font-semibold text-red-700 shadow-sm transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-400"
                    >
                      {pending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode(null)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-red-500 transition-colors hover:bg-red-100 dark:hover:bg-red-950/50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      <Tag className="h-3 w-3" />
                      {t.tag}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                      {t.contact_count.toLocaleString("id-ID")} kontak
                    </span>

                    <span className="grow" />

                    <button
                      type="button"
                      onClick={() => startRename(t.tag)}
                      title="Rename"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      <Edit3 className="h-3 w-3" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode({ type: "delete", tag: t.tag })}
                      title="Hapus tag dari semua kontak"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Merge floating bar */}
      {selected.size >= 2 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl ring-1 ring-black/5 dark:border-zinc-700 dark:bg-zinc-900 dark:ring-white/5">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-zinc-900 px-2 text-xs font-semibold tabular-nums text-white dark:bg-zinc-100 dark:text-zinc-900">
                {selected.size}
              </span>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                tag dipilih — gabung jadi 1
              </span>
              <button
                type="button"
                onClick={() => setShowMerge((v) => !v)}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <GitMerge className="h-3 w-3" />
                Merge
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            </div>

            {showMerge && (
              <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                  Sources:{" "}
                  {Array.from(selected).map((s) => (
                    <code
                      key={s}
                      className="ml-1 rounded bg-zinc-200 px-1 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      {s}
                    </code>
                  ))}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                    placeholder="Target tag (e.g., hr)"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && mergeTarget.trim()) commitMerge();
                    }}
                    className="h-8 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={commitMerge}
                    disabled={pending || !mergeTarget.trim()}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {pending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Apply
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Source tags akan dihapus, target ditambah ke semua kontak yg
                  punya source.
                </p>
              </div>
            )}

            {feedback && (
              <div
                className={`border-t px-4 py-2 text-xs font-medium ${
                  feedback.type === "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-400"
                    : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                }`}
              >
                {feedback.msg}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Standalone toast for non-merge actions */}
      {feedback && selected.size < 2 && (
        <div
          className={`fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border px-4 py-2 text-xs font-medium shadow-lg ${
            feedback.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "ok" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            {feedback.msg}
          </div>
        </div>
      )}
    </>
  );
}
