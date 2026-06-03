"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-provider";
import { updateQueueTemplates } from "../actions";

export function TemplatePoolEditor({
  slug,
  queueId,
  templates,
  initialSelected,
}: {
  slug: string;
  queueId: string;
  templates: Array<{ id: string; name: string }>;
  initialSelected: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>(initialSelected);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function save() {
    if (selected.length === 0) {
      toast.error("Pilih minimal 1 template.");
      return;
    }
    startTransition(async () => {
      const res = await updateQueueTemplates(slug, queueId, selected);
      if (res.error) toast.error(res.error);
      else toast.success("Template queue diperbarui.");
      router.refresh();
    });
  }

  const dirty =
    selected.length !== initialSelected.length ||
    selected.some((id) => !initialSelected.includes(id));

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-ink">
            Template email
          </h3>
          {selected.length > 1 && (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success-text">
              {selected.length} · rotasi acak-merata
            </span>
          )}
        </div>
        <Button
          size="sm"
          onClick={save}
          disabled={isPending || !dirty}
          variant={dirty ? "primary" : "secondary"}
        >
          {isPending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      <p className="px-5 pt-3 text-xs text-muted">
        Pilih satu atau lebih. Kalau lebih dari satu, tiap kirim dirotasi
        merata antar template biar ketahuan mana yang paling efektif.
      </p>
      <div className="space-y-1.5 p-4">
        {templates.map((t) => {
          const checked = selected.includes(t.id);
          return (
            <button
              type="button"
              key={t.id}
              onClick={() => toggle(t.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                checked
                  ? "border-action bg-surface-sunken"
                  : "border-border hover:bg-surface-sunken"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                  checked
                    ? "border-action bg-action text-on-action"
                    : "border-border-strong"
                }`}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <span className="flex-1 text-sm font-medium text-ink">
                {t.name}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
