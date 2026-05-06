"use client";

import { useState, useTransition } from "react";
import { Save, Loader2, Check, FileText } from "lucide-react";
import { updateContactNotes } from "../actions";

export function NotesEditor({
  slug,
  contactId,
  initialNotes,
}: {
  slug: string;
  contactId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [savedValue, setSavedValue] = useState(initialNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [showSaved, setShowSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value !== savedValue;

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateContactNotes(contactId, slug, value);
      if (result.ok) {
        setSavedValue(value);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-3 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Notes
          </h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            workspace-only
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showSaved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              Tersimpan
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || pending}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-zinc-900 px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Simpan
          </button>
        </div>
      </div>
      <div className="p-3">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Catatan internal — riwayat call, preferensi kontak, info dari LinkedIn, dll. Hanya keliatan di workspace ini."
          rows={4}
          className="w-full resize-y rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-100"
        />
        {error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
