"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { BUSINESS_TYPES, COLOR_THEMES } from "@/lib/workspace-constants";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, FieldError, Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { updateWorkspaceInfo, type FormState } from "./actions";

const INITIAL: FormState = {};

export function WorkspaceInfoForm({
  slug,
  initial,
}: {
  slug: string;
  initial: {
    name: string;
    business_type: string | null;
    color_theme: string;
  };
}) {
  const [state, action, pending] = useActionState(
    updateWorkspaceInfo.bind(null, slug),
    INITIAL,
  );
  const [colorTheme, setColorTheme] = useState(initial.color_theme);

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Workspace Info
        </h3>
      </div>
      <form action={action} className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ws-name" required>
              Name
            </FieldLabel>
            <Input
              id="ws-name"
              name="name"
              defaultValue={initial.name}
              required
              maxLength={50}
            />
            <FieldError>{state.fieldErrors?.name}</FieldError>
          </div>
          <div>
            <FieldLabel>Business Type</FieldLabel>
            <Select
              name="business_type"
              defaultValue={initial.business_type ?? "other"}
            >
              {BUSINESS_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.emoji} {t.label}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <FieldLabel hint="Tampak di sidebar dan dashboard accent">
            Color Theme
          </FieldLabel>
          <input type="hidden" name="color_theme" value={colorTheme} />
          <div className="flex flex-wrap gap-2">
            {COLOR_THEMES.map((c) => {
              const selected = colorTheme === c.value;
              return (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setColorTheme(c.value)}
                  title={c.label}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                    selected
                      ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-900"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c.value }}
                >
                  {selected && <Check className="h-4 w-4 text-white" />}
                </button>
              );
            })}
          </div>
        </div>

        {state.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400">
            ✓ Saved
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={pending} disabled={pending} size="sm">
            {pending ? "Menyimpan..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
