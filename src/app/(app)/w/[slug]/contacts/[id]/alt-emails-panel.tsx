"use client";

import { useState, useTransition } from "react";
import {
  AtSign,
  Plus,
  X,
  ArrowUp,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  addAltEmail,
  removeAltEmail,
  swapPrimaryEmail,
} from "./alt-email-actions";

type Props = {
  slug: string;
  contactId: string;
  primary: string;
  alts: string[];
};

export function AltEmailsPanel({ slug, contactId, primary, alts }: Props) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2200);
  }

  function handleAdd() {
    setError(null);
    const value = draft.trim();
    if (!value) return;
    setBusyEmail(value);
    startTransition(async () => {
      const res = await addAltEmail(contactId, slug, value);
      setBusyEmail(null);
      if (!res.ok) {
        setError(res.error);
      } else {
        setDraft("");
        setAdding(false);
        showFlash("Alt email ditambahkan");
      }
    });
  }

  function handleRemove(email: string) {
    setError(null);
    setBusyEmail(email);
    startTransition(async () => {
      const res = await removeAltEmail(contactId, slug, email);
      setBusyEmail(null);
      if (!res.ok) setError(res.error);
      else showFlash("Alt email dihapus");
    });
  }

  function handleSwap(email: string) {
    setError(null);
    setBusyEmail(email);
    startTransition(async () => {
      const res = await swapPrimaryEmail(contactId, slug, email);
      setBusyEmail(null);
      if (!res.ok) setError(res.error);
      else showFlash(`${email} sekarang jadi primary`);
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <AtSign className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Email
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {1 + alts.length} terdaftar
          </span>
        </div>
        {flash && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            {flash}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        {/* Primary row */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-500/30">
              Primary
            </span>
            <span className="truncate text-sm text-zinc-900 dark:text-zinc-100">
              {primary}
            </span>
          </div>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            dipakai untuk send
          </span>
        </div>

        {/* Alt rows */}
        {alts.map((alt) => {
          const isBusy = pending && busyEmail === alt;
          return (
            <div
              key={alt}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition-all ${
                isBusy
                  ? "border-zinc-300 bg-zinc-50 opacity-60 dark:border-zinc-700 dark:bg-zinc-800/60"
                  : "border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  Alt
                </span>
                <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">
                  {alt}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSwap(alt)}
                  disabled={pending}
                  title="Jadikan primary (current primary jadi alt)"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  {isBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUp className="h-3 w-3" />
                  )}
                  Jadikan primary
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(alt)}
                  disabled={pending}
                  title="Hapus alt email"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                  aria-label="Hapus"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Add row */}
        {adding ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/30">
            <input
              type="email"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                  setError(null);
                }
              }}
              autoFocus
              placeholder="alt@example.com"
              className="h-7 flex-1 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={pending || !draft.trim()}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Tambah
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
                setError(null);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-500 transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/40 dark:hover:text-zinc-100"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah email alternatif
          </button>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
