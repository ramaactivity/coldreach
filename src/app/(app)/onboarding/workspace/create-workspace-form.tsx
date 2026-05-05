"use client";

import { useActionState, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { BUSINESS_TYPES, COLOR_THEMES } from "@/lib/workspace-constants";
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
        <label
          htmlFor="name"
          className="mb-1.5 block text-sm font-medium text-zinc-900 dark:text-zinc-100"
        >
          Nama Workspace
        </label>
        <input
          id="name"
          name="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-100"
          placeholder="Tiska Catering"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            {state.fieldErrors.name}
          </p>
        )}
      </div>

      {/* Business type */}
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Tipe Bisnis
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BUSINESS_TYPES.map((type) => {
            const selected = businessType === type.value;
            return (
              <label
                key={type.value}
                className={`relative flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-all ${
                  selected
                    ? "border-zinc-900 bg-zinc-50 ring-2 ring-zinc-900/10 dark:border-zinc-100 dark:bg-zinc-800 dark:ring-zinc-100/10"
                    : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50 dark:border-zinc-800 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/50"
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
                <span className="flex-1 font-medium text-zinc-900 dark:text-zinc-100">
                  {type.label}
                </span>
                {selected && (
                  <Check className="h-4 w-4 text-zinc-900 dark:text-zinc-100" />
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Color theme */}
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Warna Theme
        </label>
        <p className="mb-2.5 text-xs text-zinc-500 dark:text-zinc-400">
          Buat membedakan workspace di sidebar dan dashboard
        </p>
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
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition-all ${
                    selected
                      ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-900"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: color.value }}
                >
                  {selected && <Check className="h-4 w-4 text-white" />}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <div className="flex flex-col gap-3 pt-2">
        {state.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-zinc-50 shadow-sm transition-all hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 active:scale-[0.99]"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Membuat workspace..." : "Buat Workspace"}
        </button>
      </div>
    </form>
  );
}
