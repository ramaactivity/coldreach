"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  X,
} from "lucide-react";
import type { PipelineStage } from "@/lib/workspace-constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { updatePipelineStages } from "./actions";

const STAGE_COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#f59e0b",
  "#a855f7",
  "#06b6d4",
  "#0ea5e9",
  "#22c55e",
  "#ef4444",
  "#ec4899",
  "#10b981",
];

function slugifyStageId(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 30) || `stage-${Date.now()}`
  );
}

export function PipelineStagesEditor({
  slug,
  initial,
}: {
  slug: string;
  initial: PipelineStage[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [stages, setStages] = useState<PipelineStage[]>(initial);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(STAGE_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = JSON.stringify(stages) !== JSON.stringify(initial);

  function move(index: number, dir: -1 | 1) {
    const ni = index + dir;
    if (ni < 0 || ni >= stages.length) return;
    const next = [...stages];
    [next[index], next[ni]] = [next[ni], next[index]];
    setStages(next);
  }

  function rename(index: number, name: string) {
    const next = [...stages];
    next[index] = { ...next[index], name };
    setStages(next);
  }

  function recolor(index: number, color: string) {
    const next = [...stages];
    next[index] = { ...next[index], color };
    setStages(next);
  }

  async function remove(index: number) {
    if (stages.length <= 2) {
      setError("Minimal 2 stages (Baru + Closed)");
      return;
    }
    const ok = await confirm({
      title: `Remove stage "${stages[index].name}"?`,
      description:
        "Kontak yang ada di stage ini akan reset ke stage default berikutnya.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setStages(stages.filter((_, i) => i !== index));
  }

  function addStage() {
    if (!newName.trim()) return;
    const id = slugifyStageId(newName);
    if (stages.some((s) => s.id === id)) {
      setError("Stage dengan ID itu sudah ada");
      return;
    }
    setStages([
      ...stages,
      {
        id,
        name: newName.trim(),
        color: newColor,
        order: stages.length + 1,
      },
    ]);
    setNewName("");
    setAdding(false);
    setError(null);
  }

  function handleSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updatePipelineStages(slug, stages);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        router.refresh();
      }
    });
  }

  function handleReset() {
    setStages(initial);
    setError(null);
    setSuccess(false);
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-ink">
          Pipeline Stages
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          Stage lifecycle untuk kontak. Custom per workspace. Order di sini =
          order kolom di Pipeline view.
        </p>
      </div>

      <div className="space-y-1.5 p-5">
        {stages.map((stage, i) => (
          <StageRow
            key={`${stage.id}-${i}`}
            stage={stage}
            index={i}
            total={stages.length}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
            onRename={(name) => rename(i, name)}
            onRecolor={(color) => recolor(i, color)}
            onRemove={() => remove(i)}
          />
        ))}

        {/* Add new */}
        {adding ? (
          <div className="rounded-lg border border-dashed border-border-strong bg-surface-sunken/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <ColorSwatch value={newColor} onChange={setNewColor} />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nama stage"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStage();
                  }
                }}
                className="h-8 flex-1 rounded-md border border-border bg-surface px-2 text-sm focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
              />
              <Button size="sm" onClick={addStage}>
                <Check className="h-3 w-3" />
                Add
              </Button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setError(null);
                }}
                className="inline-flex h-8 items-center justify-center rounded-md p-1.5 text-muted hover:bg-surface-sunken"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-surface-sunken/40 px-3 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:bg-surface-sunken hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
            Tambah Stage
          </button>
        )}

        {error && (
          <p className="rounded-lg border border-danger-soft bg-danger-soft p-2.5 text-xs text-danger-text">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-lg border border-success-soft bg-success-soft p-2.5 text-xs text-success-text">
            ✓ Pipeline saved
          </p>
        )}
      </div>

      {isDirty && (
        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-sunken/40 px-5 py-3">
          <Button variant="outline" size="sm" onClick={handleReset} disabled={pending}>
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={pending}
            loading={pending}
          >
            {pending ? "Saving..." : "Save Pipeline"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function StageRow({
  stage,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRename,
  onRecolor,
  onRemove,
}: {
  stage: PipelineStage;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-border/80 bg-surface p-2 transition-colors hover:border-border-strong">
      {/* Order */}
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-[10px] font-semibold tabular-nums text-muted">
        {index + 1}
      </span>

      <ColorSwatch value={stage.color} onChange={onRecolor} />

      <input
        type="text"
        value={stage.name}
        onChange={(e) => onRename(e.target.value)}
        maxLength={50}
        className="h-7 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-ink hover:border-border focus:border-accent focus:bg-surface focus:outline-none focus:ring-[3px] focus:ring-accent-soft"
      />

      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger-text"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ColorSwatch({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-5 w-5 shrink-0 rounded-full ring-2 ring-surface transition-transform hover:scale-110"
        style={{ backgroundColor: value }}
        aria-label="Change color"
      />
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-full z-20 mt-1 grid grid-cols-5 gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className="h-5 w-5 rounded-full ring-1 ring-border transition-transform hover:scale-110"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
