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
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <FileText className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-ink">
            Notes
          </h3>
          <span className="text-xs text-muted">
            workspace-only
          </span>
        </div>
        <div className="flex items-center gap-2">
          {showSaved && !dirty && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              Tersimpan
            </span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || pending}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-40"
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
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
        />
        {error && (
          <p className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
