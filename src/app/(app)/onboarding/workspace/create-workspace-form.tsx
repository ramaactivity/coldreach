"use client";

import { useActionState, useState } from "react";
import { BUSINESS_TYPES, COLOR_THEMES } from "@/lib/workspace-constants";
import { createWorkspace, type CreateWorkspaceState } from "./actions";

const INITIAL_STATE: CreateWorkspaceState = {};

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspace, INITIAL_STATE);
  const [name, setName] = useState("Tiska Catering");
  const [businessType, setBusinessType] = useState<string>("catering");
  const [colorTheme, setColorTheme] = useState("#f59e0b");

  return (
    <form action={action} className="flex flex-col gap-5">
      {/* Workspace name */}
      <div>
        <label
          htmlFor="name"
          className="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
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
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
          placeholder="Tiska Catering"
        />
        {state.fieldErrors?.name && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.name}
          </p>
        )}
      </div>

      {/* Business type */}
      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Tipe Bisnis
        </label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BUSINESS_TYPES.map((type) => (
            <label
              key={type.value}
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition ${
                businessType === type.value
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800"
                  : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
              }`}
            >
              <input
                type="radio"
                name="business_type"
                value={type.value}
                checked={businessType === type.value}
                onChange={(e) => setBusinessType(e.target.value)}
                className="sr-only"
              />
              <span className="text-lg">{type.emoji}</span>
              <span className="text-zinc-900 dark:text-zinc-100">
                {type.label}
              </span>
            </label>
          ))}
        </div>
        {state.fieldErrors?.business_type && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {state.fieldErrors.business_type}
          </p>
        )}
      </div>

      {/* Color theme */}
      <div>
        <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Warna Theme
        </label>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          Buat membedakan workspace di sidebar nanti
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COLOR_THEMES.map((color) => (
            <label
              key={color.value}
              className="cursor-pointer"
              title={color.label}
            >
              <input
                type="radio"
                name="color_theme"
                value={color.value}
                checked={colorTheme === color.value}
                onChange={(e) => setColorTheme(e.target.value)}
                className="sr-only"
              />
              <span
                className={`block h-9 w-9 rounded-full transition ${
                  colorTheme === color.value
                    ? "ring-2 ring-zinc-900 ring-offset-2 dark:ring-zinc-100 dark:ring-offset-zinc-900"
                    : "ring-0"
                }`}
                style={{ backgroundColor: color.value }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* Submit */}
      <div className="mt-2 flex flex-col gap-3">
        {state.error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-50 shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "Membuat workspace..." : "Buat Workspace"}
        </button>
      </div>
    </form>
  );
}
