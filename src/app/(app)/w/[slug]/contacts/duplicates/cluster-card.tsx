"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, Loader2, Check, X, AlertTriangle } from "lucide-react";
import { mergeContacts } from "./actions";

type ClusterContact = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  position: string | null;
  created_at: string;
};

type Props = {
  slug: string;
  contacts: ClusterContact[];
};

export function ClusterCard({ slug, contacts }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "select" | "running" | "done">(
    "idle",
  );
  const [keepId, setKeepId] = useState(contacts[0]?.id ?? "");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<string[]>([]);

  function commit() {
    const others = contacts.filter((c) => c.id !== keepId);
    if (others.length === 0) return;
    setMode("running");
    setProgress({ done: 0, total: others.length });
    setErrors([]);
    startTransition(async () => {
      const errs: string[] = [];
      for (const c of others) {
        const res = await mergeContacts(slug, keepId, c.id);
        if (!res.ok) errs.push(`${c.email}: ${res.error}`);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
      setErrors(errs);
      setMode("done");
      setTimeout(() => router.refresh(), 600);
    });
  }

  const header = contacts[0];

  if (mode === "done") {
    const succeeded = progress.total - errors.length;
    return (
      <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          {succeeded} kontak ter-merge ke{" "}
          <code className="rounded bg-white px-1 py-0.5 font-mono text-xs dark:bg-zinc-800">
            {contacts.find((c) => c.id === keepId)?.email}
          </code>
        </p>
        {errors.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-red-600 dark:text-red-400">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {header?.full_name ?? "—"}
            {header?.company && (
              <span className="ml-1.5 font-normal text-zinc-500 dark:text-zinc-400">
                · {header.company}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {contacts.length} kontak
          </p>
        </div>
        {mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("select")}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <GitMerge className="h-3 w-3" />
            Merge cluster
          </button>
        )}
      </div>

      {mode === "idle" && (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/w/${slug}/contacts/${c.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {c.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {c.position ?? "—"} · ditambahkan{" "}
                    {new Date(c.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {mode === "select" && (
        <div className="bg-amber-50/40 p-5 dark:bg-amber-950/20">
          <div className="mb-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                Pilih kontak primary — yang lain akan di-merge ke ini
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-400">
                Email mereka jadi alt_emails, tags / notes / history
                di-merge. Yang non-primary akan soft-deleted.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {contacts.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 transition-colors dark:bg-zinc-900 ${
                  keepId === c.id
                    ? "border-amber-300 dark:border-amber-700"
                    : "border-zinc-200 hover:border-amber-200 dark:border-zinc-800 dark:hover:border-amber-900/50"
                }`}
              >
                <input
                  type="radio"
                  checked={keepId === c.id}
                  onChange={() => setKeepId(c.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {c.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {c.position ?? "—"} · created{" "}
                    {new Date(c.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                {keepId === c.id && (
                  <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-800 dark:text-amber-200">
                    Primary
                  </span>
                )}
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <X className="h-3 w-3" />
              Batal
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <GitMerge className="h-3 w-3" />
              Merge {contacts.length - 1} kontak
            </button>
          </div>
        </div>
      )}

      {mode === "running" && (
        <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Merging... {progress.done}/{progress.total}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{
                width: `${
                  progress.total > 0
                    ? (progress.done / progress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
