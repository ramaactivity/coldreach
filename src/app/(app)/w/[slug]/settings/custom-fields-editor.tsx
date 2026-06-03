"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  X,
  Loader2,
  Save,
  Check,
  GripVertical,
  ArrowUp,
  ArrowDown,
  AlertCircle,
} from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  type CustomField,
  type CustomFieldType,
} from "@/lib/workspace-constants";
import { Card } from "@/components/ui/card";
import { Select, SelectItem } from "@/components/ui/select";
import { updateCustomFieldsSchema } from "./actions";

function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

export function CustomFieldsEditor({
  slug,
  initial,
}: {
  slug: string;
  initial: CustomField[];
}) {
  const [fields, setFields] = useState<CustomField[]>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);

  function addField() {
    const baseLabel = "Field baru";
    let baseId = "field_baru";
    let n = 1;
    const existing = new Set(fields.map((f) => f.id));
    while (existing.has(baseId)) {
      n += 1;
      baseId = `field_baru_${n}`;
    }
    setFields([
      ...fields,
      { id: baseId, label: baseLabel, type: "text", required: false },
    ]);
  }

  function updateField(idx: number, patch: Partial<CustomField>) {
    setFields(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function removeField(idx: number) {
    setFields(fields.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[idx], next[j]] = [next[j], next[idx]];
    setFields(next);
  }

  function handleLabelChange(idx: number, label: string) {
    const f = fields[idx];
    // Auto-update id from label if user hasn't manually edited the id
    const looksLikeAutoId = f.id === slugify(f.label);
    const update: Partial<CustomField> = { label };
    if (looksLikeAutoId) {
      const newId = slugify(label);
      const otherIds = new Set(
        fields.filter((_, i) => i !== idx).map((x) => x.id),
      );
      if (newId && !otherIds.has(newId)) update.id = newId;
    }
    updateField(idx, update);
  }

  function handleSave() {
    setError(null);
    // Local validation
    const ids = new Set<string>();
    for (const f of fields) {
      if (!f.label.trim()) {
        setError("Semua field butuh label");
        return;
      }
      if (!f.id || !/^[a-z0-9_]+$/.test(f.id)) {
        setError(`ID "${f.id}" invalid (lowercase + underscore only)`);
        return;
      }
      if (ids.has(f.id)) {
        setError(`Duplicate ID: ${f.id}`);
        return;
      }
      ids.add(f.id);
      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        setError(`Select field "${f.label}" butuh minimal 1 option`);
        return;
      }
    }
    startTransition(async () => {
      const res = await updateCustomFieldsSchema(slug, fields);
      if (res.ok) {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2200);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Custom Fields
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {fields.length}/20 field. Muncul di form contact untuk workspace
            ini.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-xs text-success-text">
              <Check className="h-3 w-3" />
              Tersimpan
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={pending || !dirty}
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
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface-sunken/40 px-4 py-6 text-center">
            <p className="text-sm text-ink-secondary">
              Belum ada custom field
            </p>
            <p className="mt-1 text-xs text-muted">
              Contoh untuk catering: Budget Estimasi (number), Tanggal Tasting
              (date), Tipe Acara (select).
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {fields.map((f, idx) => (
              <FieldRow
                key={idx}
                field={f}
                isFirst={idx === 0}
                isLast={idx === fields.length - 1}
                onChange={(patch) => updateField(idx, patch)}
                onLabelChange={(label) => handleLabelChange(idx, label)}
                onRemove={() => removeField(idx)}
                onMoveUp={() => move(idx, -1)}
                onMoveDown={() => move(idx, 1)}
              />
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={addField}
          disabled={fields.length >= 20}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-xs font-medium text-muted transition-all hover:border-border-strong hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah field
        </button>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-xs text-danger-text">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function FieldRow({
  field,
  isFirst,
  isLast,
  onChange,
  onLabelChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: CustomField;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<CustomField>) => void;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [showOptions, setShowOptions] = useState(field.type === "select");

  return (
    <li className="rounded-lg border border-border/80 bg-surface p-3">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            className="inline-flex h-4 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-surface-sunken hover:text-ink-secondary disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            className="inline-flex h-4 w-5 items-center justify-center rounded text-faint transition-colors hover:bg-surface-sunken hover:text-ink-secondary disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </div>

        <GripVertical className="h-4 w-4 shrink-0 text-faint" />

        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="text"
            value={field.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Label (e.g., Budget Estimasi)"
            className="h-8 rounded-md border border-border bg-surface px-2.5 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
          />

          <div className="w-[140px]">
            <Select
              value={field.type}
              onValueChange={(v) => {
                const newType = v as CustomFieldType;
                onChange({ type: newType });
                if (newType === "select") setShowOptions(true);
              }}
              size="sm"
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </Select>
          </div>

          <label className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs text-ink-secondary">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="h-3.5 w-3.5"
            />
            Required
          </label>
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Hapus field"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger-soft hover:text-danger-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ID + hint */}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[200px_1fr]">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-surface-sunken/60 px-2 py-1 text-[10px] font-mono text-muted">
          id:
          <input
            type="text"
            value={field.id}
            onChange={(e) =>
              onChange({ id: e.target.value.toLowerCase().replace(/\s/g, "_") })
            }
            className="h-5 flex-1 bg-transparent text-ink-secondary outline-none"
          />
        </div>
        <input
          type="text"
          value={field.hint ?? ""}
          onChange={(e) => onChange({ hint: e.target.value })}
          placeholder="Help text (optional)"
          className="h-7 rounded-md border border-border bg-surface px-2.5 text-xs text-ink-secondary placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
        />
      </div>

      {/* Select options */}
      {field.type === "select" && (
        <div className="mt-2">
          {showOptions && (
            <div className="rounded-md border border-border bg-surface-sunken/60 p-2">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Options (1 per baris)
              </p>
              <textarea
                value={(field.options ?? []).join("\n")}
                onChange={(e) =>
                  onChange({
                    options: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                rows={3}
                placeholder={"Wedding\nCorporate\nBirthday"}
                className="w-full resize-y rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
