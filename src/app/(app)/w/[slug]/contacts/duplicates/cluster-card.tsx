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
      <div className="rounded-xl border border-success-soft/60 bg-success-soft/40 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-success-text">
          <Check className="h-4 w-4" />
          {succeeded} kontak ter-merge ke{" "}
          <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
            {contacts.find((c) => c.id === keepId)?.email}
          </code>
        </p>
        {errors.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-danger">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-2 border-b border-border px-5 py-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {header?.full_name ?? "—"}
            {header?.company && (
              <span className="ml-1.5 font-normal text-muted">
                · {header.company}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {contacts.length} kontak
          </p>
        </div>
        {mode === "idle" && (
          <button
            type="button"
            onClick={() => setMode("select")}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
          >
            <GitMerge className="h-3 w-3" />
            Merge cluster
          </button>
        )}
      </div>

      {mode === "idle" && (
        <ul className="divide-y divide-border">
          {contacts.map((c) => (
            <li key={c.id}>
              <Link
                href={`/w/${slug}/contacts/${c.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-surface-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {c.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
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
        <div className="bg-warning-soft/40 p-5">
          <div className="mb-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-sm font-medium text-warning-text">
                Pilih kontak primary — yang lain akan di-merge ke ini
              </p>
              <p className="mt-0.5 text-xs text-warning-text">
                Email mereka jadi alt_emails, tags / notes / history
                di-merge. Yang non-primary akan soft-deleted.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {contacts.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border bg-surface px-3 py-2 transition-colors ${
                  keepId === c.id
                    ? "border-warning"
                    : "border-border hover:border-warning-soft"
                }`}
              >
                <input
                  type="radio"
                  checked={keepId === c.id}
                  onChange={() => setKeepId(c.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {c.email}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {c.position ?? "—"} · created{" "}
                    {new Date(c.created_at).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                {keepId === c.id && (
                  <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-text">
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
              className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-sunken"
            >
              <X className="h-3 w-3" />
              Batal
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={pending}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-3 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
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
            <Loader2 className="h-4 w-4 animate-spin text-info" />
            <p className="text-sm text-ink-secondary">
              Merging... {progress.done}/{progress.total}
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-info transition-all"
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
