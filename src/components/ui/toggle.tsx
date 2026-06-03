"use client";

import { cn } from "@/lib/utils";

/**
 * 36x20 switch. Track off = border-strong, on = action ink; white thumb.
 * Accessible (role="switch"); hit-area meets 44px via padding on touch.
 */
export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  id,
  name,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <>
      {name && (
        <input type="hidden" name={name} value={checked ? "true" : "false"} />
      )}
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        data-state={checked ? "checked" : "unchecked"}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-action" : "bg-border-strong",
          className,
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </>
  );
}
