"use client";

import { Toaster, toast as sonnerToast } from "sonner";

/**
 * Sonner styled to the toast spec: dark zinc-900 surface, white text,
 * rounded-lg, shadow-lg (floating), with a 2px left accent-bar per tone
 * (info/default = accent, success, error = danger). Toast = ephemeral.
 * Mount once at the root layout; dispatch via the exported `toast` helper.
 */
export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      theme="dark"
      gap={8}
      offset={16}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "rounded-lg border-0 border-l-2 border-l-accent !bg-zinc-900 !text-on-action shadow-[var(--shadow-lg)]",
          title: "text-[13px] font-semibold !text-on-action",
          description: "text-[12px] leading-relaxed !text-zinc-300",
          success: "border-l-success",
          error: "border-l-danger",
          warning: "border-l-warning",
          info: "border-l-accent",
          actionButton: "rounded-md !bg-on-action !text-ink hover:!bg-zinc-200",
          cancelButton: "rounded-md !bg-zinc-700 !text-zinc-200 hover:!bg-zinc-600",
          closeButton: "!bg-zinc-800 !text-zinc-300 !border-zinc-700",
        },
      }}
      closeButton
    />
  );
}

export { sonnerToast as toast };
