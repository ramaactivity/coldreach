"use client";

import { Toaster, toast as sonnerToast } from "sonner";
import { useEffect, useState } from "react";

/**
 * Wraps Sonner Toaster with our app's visual style. Mount once at the
 * root layout. Components dispatch via the exported `toast` helper.
 */
export function ToastProvider() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(mq.matches ? "dark" : "light");
    const handler = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      richColors
      closeButton
      gap={8}
      offset={16}
      duration={4500}
      toastOptions={{
        classNames: {
          toast:
            "rounded-2xl border border-zinc-200/70 bg-white/95 backdrop-blur-xl shadow-[0_8px_24px_-4px_rgb(0_0_0/0.12),0_2px_6px_-2px_rgb(0_0_0/0.06)] dark:border-zinc-800/70 dark:bg-zinc-900/95",
          title: "text-[13px] font-semibold tracking-[-0.005em]",
          description: "text-[11.5px] leading-relaxed",
          actionButton:
            "rounded-lg !bg-zinc-900 !text-white hover:!bg-zinc-800 dark:!bg-zinc-100 dark:!text-zinc-900",
          cancelButton:
            "rounded-lg !bg-zinc-100 !text-zinc-700 hover:!bg-zinc-200 dark:!bg-zinc-800 dark:!text-zinc-300",
        },
      }}
    />
  );
}

export { sonnerToast as toast };
