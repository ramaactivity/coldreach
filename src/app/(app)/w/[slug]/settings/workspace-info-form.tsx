"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import {
  BUSINESS_TYPES,
  COLOR_THEMES,
  accentFromColorTheme,
} from "@/lib/workspace-constants";
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
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-[15px] font-semibold text-ink">Workspace Info</h3>
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
          {/* Swatch renders the AA-safe preset (via data-accent + bg-accent) so the
              dot you pick == the accent that renders. Stored value stays the hex. */}
          <div className="flex flex-wrap gap-2">
            {COLOR_THEMES.map((c) => {
              const selected = colorTheme === c.value;
              return (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setColorTheme(c.value)}
                  title={c.label}
                  data-accent={accentFromColorTheme(c.value)}
                  className={`grid size-9 place-items-center rounded-full bg-accent transition-transform ${
                    selected
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-surface"
                      : "hover:scale-110"
                  }`}
                >
                  {selected && <Check className="h-4 w-4 text-accent-fg" />}
                </button>
              );
            })}
          </div>
        </div>

        {state.error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft p-3 text-[13px] font-medium text-danger-text">
            {state.error}
          </p>
        )}
        {state.success && (
          <p className="rounded-md border border-success-soft bg-success-soft p-3 text-[13px] font-medium text-success-text">
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
