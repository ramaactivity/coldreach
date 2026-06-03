"use client";

import { Check } from "lucide-react";

/** Custom switch — replaces native checkboxes for boolean options. */
export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2 text-left"
    >
      <span
        className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors duration-200 ${
          checked
            ? "bg-zinc-900 dark:bg-zinc-100"
            : "bg-zinc-200 group-hover:bg-zinc-300 dark:bg-zinc-700 dark:group-hover:bg-zinc-600"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-zinc-950 ${
            checked ? "translate-x-[15px]" : "translate-x-[2px]"
          }`}
        />
      </span>
      <span className="text-xs leading-snug text-zinc-600 dark:text-zinc-400">
        {children}
      </span>
    </button>
  );
}

/** Custom checkbox — square, branded, for selecting rows. */
export function CheckBox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
        disabled
          ? "cursor-not-allowed border-zinc-200 bg-zinc-100 opacity-50 dark:border-zinc-800 dark:bg-zinc-800"
          : checked
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
            : "border-zinc-300 bg-white hover:border-zinc-400 dark:border-zinc-600 dark:bg-zinc-900"
      }`}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}
