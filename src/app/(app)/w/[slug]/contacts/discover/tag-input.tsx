"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Comma/Enter → pill input. Type freely; a comma, Enter, or paste with commas
 * splits into removable pills. Backspace on an empty box removes the last pill.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const parts = text
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const merged = [...value];
    for (const p of parts) {
      if (!seen.has(p.toLowerCase())) {
        merged.push(p);
        seen.add(p.toLowerCase());
      }
    }
    onChange(merged);
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-accent-soft">
      {value.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-surface-sunken py-0.5 pl-2 pr-1 text-xs font-medium text-ink-secondary"
        >
          {t}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="rounded-full p-0.5 text-faint hover:bg-surface-hover hover:text-ink-secondary"
            aria-label={`Hapus ${t}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (/[,\n]/.test(v)) {
            commit(v);
            setDraft("");
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) {
            commit(draft);
            setDraft("");
          }
        }}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-ink outline-none placeholder:text-faint"
      />
    </div>
  );
}
