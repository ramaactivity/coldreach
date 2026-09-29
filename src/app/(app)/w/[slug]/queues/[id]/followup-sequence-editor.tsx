"use client";

import { useState, useTransition } from "react";
import {
  Repeat,
  Plus,
  X,
  Loader2,
  Save,
  Check,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import {
  MAX_FOLLOWUP_STEPS,
  DEFAULT_FOLLOWUP_DAYS,
  type FollowupStep,
} from "@/lib/queue-helpers";
import { Select, SelectItem } from "@/components/ui/select";
import { updateFollowupSequence } from "../actions";

type TemplateLite = { id: string; name: string };

type Props = {
  slug: string;
  queueId: string;
  templates: TemplateLite[];
  initialSteps: FollowupStep[];
  primaryTemplateName: string | null;
};

export function FollowupSequenceEditor({
  slug,
  queueId,
  templates,
  initialSteps,
  primaryTemplateName,
}: Props) {
  const [steps, setSteps] = useState<FollowupStep[]>(
    initialSteps.length > 0 ? initialSteps : [],
  );
  // Baseline the "dirty" check against the last SAVED state, not the initial
  // prop — after a successful save the prop stays stale (no router.refresh),
  // which would otherwise leave the Save button enabled on unchanged data.
  const [savedSteps, setSavedSteps] = useState<FollowupStep[]>(initialSteps);
  const [editing, setEditing] = useState(initialSteps.length === 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = JSON.stringify(steps) !== JSON.stringify(savedSteps);
  const templateById = new Map(templates.map((t) => [t.id, t.name]));

  function addStep() {
    if (steps.length >= MAX_FOLLOWUP_STEPS) return;
    const days = DEFAULT_FOLLOWUP_DAYS[steps.length] ?? 7;
    setSteps([...steps, { template_id: "", after_days: days }]);
  }

  function removeStep(idx: number) {
    setSteps(steps.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, patch: Partial<FollowupStep>) {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function handleSave() {
    setError(null);
    // Validate: all steps must have template_id + valid days
    for (const [i, s] of steps.entries()) {
      if (!s.template_id) {
        setError(`Step ${i + 1}: pilih template`);
        return;
      }
      if (s.after_days < 1 || s.after_days > 60) {
        setError(`Step ${i + 1}: hari harus 1-60`);
        return;
      }
    }
    startTransition(async () => {
      const res = await updateFollowupSequence(slug, queueId, steps);
      if (res.ok) {
        setSavedSteps(steps); // new baseline → dirty resets to false
        setSavedFlash(true);
        setEditing(false);
        setTimeout(() => setSavedFlash(false), 2200);
      } else {
        setError(res.error);
      }
    });
  }

  function handleCancel() {
    // Revert to the last saved baseline (which is initialSteps until the first
    // successful save), not the stale prop.
    setSteps(savedSteps);
    setEditing(false);
    setError(null);
  }

  // Compute estimated total days for the sequence
  const totalDays = steps.reduce((sum, s) => sum + (s.after_days || 0), 0);

  if (!editing && steps.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
          <Header />
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              if (steps.length === 0) addStep();
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-action px-2.5 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover"
          >
            <Plus className="h-3 w-3" />
            Setup follow-up
          </button>
        </div>
        <div className="px-5 py-6 text-center">
          <p className="text-sm text-ink-secondary">
            Belum ada follow-up.
          </p>
          <p className="mt-1 text-xs text-muted">
            Cold email tanpa follow-up cuma dapet ~5-10% reply. Tambah 1-3 step
            biar reply rate naik 2-3×.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-3">
        <Header />
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3 w-3" />
              Tersimpan
            </span>
          )}
          {totalDays > 0 && !editing && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
              ~{totalDays} hari sequence
            </span>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-sunken"
            >
              Edit
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex h-7 items-center gap-1 rounded-md text-xs font-medium text-muted transition-colors hover:bg-surface-sunken hover:text-ink"
            >
              Batal
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 p-3">
        {/* Step 0 = original send (read-only reference) */}
        <SequenceNode
          stepLabel="Email pertama"
          stepDescription="Original send ke audience"
          templateName={primaryTemplateName ?? "—"}
          icon={<Sparkles className="h-3.5 w-3.5 text-success" />}
          isOriginal
        />

        {steps.map((step, idx) => (
          <FollowupRow
            key={idx}
            stepNumber={idx + 1}
            step={step}
            templates={templates}
            templateName={templateById.get(step.template_id) ?? null}
            editing={editing}
            onUpdate={(patch) => updateStep(idx, patch)}
            onRemove={() => removeStep(idx)}
          />
        ))}

        {editing && steps.length < MAX_FOLLOWUP_STEPS && (
          <button
            type="button"
            onClick={addStep}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-xs font-medium text-muted transition-all hover:border-border-strong hover:bg-surface-sunken hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah step ({steps.length + 1}/{MAX_FOLLOWUP_STEPS})
          </button>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-xs text-danger-text">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {editing && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted">
              Hari = jeda dari email/step sebelumnya. Reply otomatis stop
              follow-up.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || !dirty}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-action px-3 text-xs font-semibold text-on-action transition-colors hover:bg-action-hover disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" />
              )}
              Simpan sequence
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-soft text-warning">
        <Repeat className="h-3.5 w-3.5" />
      </div>
      <h3 className="text-sm font-semibold text-ink">
        Follow-up Sequence
      </h3>
      <span className="text-xs text-muted">
        max 3 step
      </span>
    </div>
  );
}

function SequenceNode({
  stepLabel,
  stepDescription,
  templateName,
  icon,
  isOriginal,
}: {
  stepLabel: string;
  stepDescription: string;
  templateName: string;
  icon: React.ReactNode;
  isOriginal?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
        isOriginal
          ? "border-success-soft/60 bg-success-soft/40"
          : "border-border/80 bg-surface-sunken/40"
      }`}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isOriginal
            ? "bg-success-soft"
            : "bg-surface-sunken"
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {stepLabel}
        </p>
        <p className="truncate text-xs text-muted">
          {stepDescription} · {templateName}
        </p>
      </div>
    </div>
  );
}

function FollowupRow({
  stepNumber,
  step,
  templates,
  templateName,
  editing,
  onUpdate,
  onRemove,
}: {
  stepNumber: number;
  step: FollowupStep;
  templates: TemplateLite[];
  templateName: string | null;
  editing: boolean;
  onUpdate: (patch: Partial<FollowupStep>) => void;
  onRemove: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-center py-0.5">
        <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-faint">
          <ChevronDown className="h-3 w-3" />
          tunggu {step.after_days || "?"} hari
          <ChevronDown className="h-3 w-3" />
        </div>
      </div>
      <div
        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
          editing
            ? "border-warning-soft bg-warning-soft/40"
            : "border-border/80 bg-surface"
        }`}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <Repeat className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-warning-soft/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-text">
              Step {stepNumber}
            </span>
            <span className="text-sm font-medium text-ink">
              Follow-up {stepNumber}
            </span>
          </div>

          {editing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="w-[180px]">
                <Select
                  value={step.template_id}
                  onValueChange={(v) => onUpdate({ template_id: v })}
                  placeholder="— Pilih template —"
                  size="sm"
                >
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <span className="text-xs text-muted">
                kirim
              </span>
              <input
                type="number"
                min={1}
                max={60}
                value={step.after_days}
                onChange={(e) =>
                  onUpdate({ after_days: parseInt(e.target.value, 10) || 0 })
                }
                className="h-7 w-14 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
              />
              <span className="text-xs text-muted">
                hari setelah {stepNumber === 1 ? "email pertama" : `step ${stepNumber - 1}`}
              </span>
            </div>
          ) : (
            <p className="mt-1 truncate text-xs text-muted">
              <ArrowRight className="mr-1 inline-block h-3 w-3" />
              Template:{" "}
              <strong className="font-medium text-ink-secondary">
                {templateName ?? "(belum dipilih)"}
              </strong>{" "}
              · setelah {step.after_days} hari
            </p>
          )}
        </div>
        {editing && (
          <button
            type="button"
            onClick={onRemove}
            title="Hapus step"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger-soft hover:text-danger"
            aria-label="Hapus step"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );
}
