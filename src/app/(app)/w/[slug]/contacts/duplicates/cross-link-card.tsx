"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  GitMerge,
  Loader2,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { mergeContacts } from "./actions";

type ContactInfo = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
};

type Props = {
  slug: string;
  email: string;
  primaryContact: ContactInfo;
  altOwnerContact: ContactInfo;
};

export function CrossLinkCard({
  slug,
  email,
  primaryContact,
  altOwnerContact,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "confirm" | "done">("idle");
  const [keepId, setKeepId] = useState(primaryContact.id);
  const [error, setError] = useState<string | null>(null);

  const keep = keepId === primaryContact.id ? primaryContact : altOwnerContact;
  const drop = keepId === primaryContact.id ? altOwnerContact : primaryContact;

  function commit() {
    setError(null);
    startTransition(async () => {
      const res = await mergeContacts(slug, keep.id, drop.id);
      if (res.ok) {
        setMode("done");
        setTimeout(() => router.refresh(), 400);
      } else {
        setError(res.error);
      }
    });
  }

  if (mode === "done") {
    return (
      <li className="px-5 py-4">
        <div className="inline-flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2 text-sm font-medium text-success-text">
          <Check className="h-4 w-4" />
          Merged — refreshing...
        </div>
      </li>
    );
  }

  return (
    <li className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-surface-sunken px-2 py-0.5 text-xs font-mono text-ink">
          {email}
        </code>
        <span className="text-xs text-muted">
          muncul di 2 kontak
        </span>
      </div>

      {mode === "idle" && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <ContactPreview
              slug={slug}
              contact={primaryContact}
              role="Primary di sini"
            />
            <ContactPreview
              slug={slug}
              contact={altOwnerContact}
              role="Alt di sini"
            />
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setMode("confirm")}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
            >
              <GitMerge className="h-3 w-3" />
              Merge jadi 1 kontak
            </button>
          </div>
        </>
      )}

      {mode === "confirm" && (
        <div className="rounded-lg border border-warning-soft bg-warning-soft/50 p-3">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="flex-1">
              <p className="text-sm font-medium text-warning-text">
                Pilih kontak mana yang dipertahankan
              </p>
              <p className="mt-0.5 text-xs text-warning-text">
                Email kontak yang dijatuhkan jadi alt di yang dipertahankan.
                Tags / notes / history di-merge. Aksi ini soft-delete kontak
                kedua (data masih ada di DB tapi sembunyi).
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
                keepId === primaryContact.id
                  ? "border-warning bg-surface"
                  : "border-warning-soft/60 hover:bg-surface/60"
              }`}
            >
              <input
                type="radio"
                checked={keepId === primaryContact.id}
                onChange={() => setKeepId(primaryContact.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  Pertahankan: {primaryContact.full_name ?? primaryContact.email}
                </p>
                <p className="truncate text-xs text-muted">
                  {primaryContact.email} · {primaryContact.company ?? "—"}
                </p>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
                keepId === altOwnerContact.id
                  ? "border-warning bg-surface"
                  : "border-warning-soft/60 hover:bg-surface/60"
              }`}
            >
              <input
                type="radio"
                checked={keepId === altOwnerContact.id}
                onChange={() => setKeepId(altOwnerContact.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  Pertahankan: {altOwnerContact.full_name ?? altOwnerContact.email}
                </p>
                <p className="truncate text-xs text-muted">
                  {altOwnerContact.email} · {altOwnerContact.company ?? "—"}
                </p>
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-2 text-xs text-danger">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("idle");
                setError(null);
              }}
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
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <GitMerge className="h-3 w-3" />
              )}
              Merge {drop.email} → {keep.email}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ContactPreview({
  slug,
  contact,
  role,
}: {
  slug: string;
  contact: ContactInfo;
  role: string;
}) {
  return (
    <Link
      href={`/w/${slug}/contacts/${contact.id}`}
      className="group flex items-center justify-between gap-2 rounded-lg border border-border/80 bg-surface px-3 py-2.5 transition-all hover:border-border-strong hover:bg-surface-sunken"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {contact.full_name ?? contact.email}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {contact.company ?? contact.email}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-warning">
          {role}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-muted" />
    </Link>
  );
}
