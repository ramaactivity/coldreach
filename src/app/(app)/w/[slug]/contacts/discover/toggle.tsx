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
            ? "bg-action"
            : "bg-surface-hover group-hover:bg-border-strong"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-surface transition-transform duration-200 ${
            checked ? "translate-x-[15px]" : "translate-x-[2px]"
          }`}
        />
      </span>
      <span className="text-xs leading-snug text-muted">
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
          ? "cursor-not-allowed border-border bg-surface-sunken opacity-50"
          : checked
            ? "border-action bg-action text-on-action"
            : "border-border-strong bg-surface hover:border-border-strong"
      }`}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
}
