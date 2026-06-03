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
        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Merged — refreshing...
        </div>
      </li>
    );
  }

  return (
    <li className="px-5 py-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
          {email}
        </code>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
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
              className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <GitMerge className="h-3 w-3" />
              Merge jadi 1 kontak
            </button>
          </div>
        </>
      )}

      {mode === "confirm" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <div className="mb-2 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-300">
                Pilih kontak mana yang dipertahankan
              </p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-400">
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
                  ? "border-amber-300 bg-white dark:border-amber-700 dark:bg-zinc-900"
                  : "border-amber-200/60 hover:bg-white/60 dark:border-amber-900/30 dark:hover:bg-zinc-900/40"
              }`}
            >
              <input
                type="radio"
                checked={keepId === primaryContact.id}
                onChange={() => setKeepId(primaryContact.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Pertahankan: {primaryContact.full_name ?? primaryContact.email}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {primaryContact.email} · {primaryContact.company ?? "—"}
                </p>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
                keepId === altOwnerContact.id
                  ? "border-amber-300 bg-white dark:border-amber-700 dark:bg-zinc-900"
                  : "border-amber-200/60 hover:bg-white/60 dark:border-amber-900/30 dark:hover:bg-zinc-900/40"
              }`}
            >
              <input
                type="radio"
                checked={keepId === altOwnerContact.id}
                onChange={() => setKeepId(altOwnerContact.id)}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  Pertahankan: {altOwnerContact.full_name ?? altOwnerContact.email}
                </p>
                <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {altOwnerContact.email} · {altOwnerContact.company ?? "—"}
                </p>
              </div>
            </label>
          </div>

          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
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
      className="group flex items-center justify-between gap-2 rounded-lg border border-zinc-200/80 bg-white px-3 py-2.5 transition-all hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/40"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {contact.full_name ?? contact.email}
        </p>
        <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
          {contact.company ?? contact.email}
        </p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
          {role}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
    </Link>
  );
}
