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
    // Guard against a double-fire (button click + Enter, or Enter pressed
    // twice) while a transition is already in flight.
    if (pending) return;
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
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
            <AtSign className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-ink">
            Email
          </h3>
          <span className="text-xs text-muted">
            {1 + alts.length} terdaftar
          </span>
        </div>
        {flash && (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <Check className="h-3 w-3" />
            {flash}
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        {/* Primary row */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface-sunken/50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success-text">
              Primary
            </span>
            <span className="truncate text-sm text-ink">
              {primary}
            </span>
          </div>
          <span className="text-xs text-faint">
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
                  ? "border-border-strong bg-surface-sunken opacity-60"
                  : "border-border/80 bg-surface hover:border-border-strong"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                  Alt
                </span>
                <span className="truncate text-sm text-ink-secondary">
                  {alt}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleSwap(alt)}
                  disabled={pending}
                  title="Jadikan primary (current primary jadi alt)"
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
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
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
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
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-sunken/50 px-3 py-2">
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
              className="h-7 flex-1 rounded-md border border-border bg-surface px-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={pending || !draft.trim()}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-50"
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-xs font-medium text-muted transition-all hover:border-border-strong hover:bg-surface-sunken hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah email alternatif
          </button>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-xs text-danger-text">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
