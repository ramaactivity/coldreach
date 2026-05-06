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
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border shadow-lg ring-1 ring-black/5 dark:ring-white/5",
          title: "text-sm font-medium",
          description: "text-xs",
        },
      }}
    />
  );
}

export { sonnerToast as toast };
