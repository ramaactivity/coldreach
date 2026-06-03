"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import {
  BUSINESS_TYPES,
  COLOR_THEMES,
  accentFromColorTheme,
} from "@/lib/workspace-constants";
import { Button } from "@/components/ui/button";
import { FieldLabel, FieldError, Input } from "@/components/ui/input";
import { createWorkspace, type CreateWorkspaceState } from "./actions";

const INITIAL_STATE: CreateWorkspaceState = {};

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, INITIAL_STATE);
  const [name, setName] = useState("Tiska Catering");
  const [businessType, setBusinessType] = useState<string>("catering");
  const [colorTheme, setColorTheme] = useState("#f59e0b");

  return (
    <form action={action} className="flex flex-col gap-6">
      {/* Workspace name */}
      <div>
        <FieldLabel htmlFor="name" required>
          Nama Workspace
        </FieldLabel>
        <Input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Tiska Catering"
        />
        <FieldError>{state.fieldErrors?.name}</FieldError>
      </div>

      {/* Business type */}
      <div>
        <FieldLabel>Tipe Bisnis</FieldLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BUSINESS_TYPES.map((type) => {
            const selected = businessType === type.value;
            return (
              <label
                key={type.value}
                className={`relative flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${
                  selected
                    ? "border-action bg-surface-sunken"
                    : "border-border hover:border-border-strong hover:bg-surface-hover"
                }`}
              >
                <input
                  type="radio"
                  name="business_type"
                  value={type.value}
                  checked={selected}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="sr-only"
                />
                <span className="text-lg">{type.emoji}</span>
                <span className="flex-1 font-medium text-ink">
                  {type.label}
                </span>
                {selected && <Check className="h-4 w-4 text-ink" />}
              </label>
            );
          })}
        </div>
      </div>

      {/* Color theme */}
      <div>
        <FieldLabel hint="Buat membedakan workspace di sidebar dan dashboard">
          Warna Theme
        </FieldLabel>
        {/* Swatch renders the AA-safe preset; stored value stays the hex. */}
        <div className="flex flex-wrap gap-2">
          {COLOR_THEMES.map((color) => {
            const selected = colorTheme === color.value;
            return (
              <label
                key={color.value}
                className="cursor-pointer"
                title={color.label}
              >
                <input
                  type="radio"
                  name="color_theme"
                  value={color.value}
                  checked={selected}
                  onChange={(e) => setColorTheme(e.target.value)}
                  className="sr-only"
                />
                <span
                  data-accent={accentFromColorTheme(color.value)}
                  className={`grid size-9 place-items-center rounded-full bg-accent transition-transform ${
                    selected
                      ? "ring-2 ring-ink ring-offset-2 ring-offset-surface"
                      : "hover:scale-110"
                  }`}
                >
                  {selected && <Check className="h-4 w-4 text-accent-fg" />}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <div className="flex flex-col gap-3 pt-2">
        {state.error && (
          <p className="rounded-md border border-danger-soft bg-danger-soft p-3 text-[13px] font-medium text-danger-text">
            {state.error}
          </p>
        )}
        <Button
          type="submit"
          loading={pending}
          disabled={pending}
          size="lg"
          className="w-full"
        >
          {pending ? "Membuat workspace..." : "Buat Workspace"}
        </Button>
      </div>
    </form>
  );
}
