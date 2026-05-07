"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to console for debugging — remote logging hooks here later.
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 ring-1 ring-red-200/60 dark:bg-red-950/40 dark:ring-red-900/40">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.022em] text-zinc-950 dark:text-zinc-50">
          Ada yang gak beres
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Halaman ini error. Coba refresh dulu — kalau masih kejadian, kabarin
          dan kasih tau apa yang lu lakukan tepat sebelum ini muncul.
        </p>
        {error.digest && (
          <p className="mt-3 inline-block rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 text-[13px] font-medium text-zinc-50 shadow-[0_1px_2px_0_rgb(0_0_0/0.08)] transition-all duration-150 hover:bg-zinc-800 hover:shadow-[0_2px_6px_-1px_rgb(0_0_0/0.12)] active:scale-[0.97] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Coba lagi
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-zinc-200/70 bg-white px-3.5 text-[13px] font-medium text-zinc-700 shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all duration-150 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.97] dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80"
          >
            <Home className="h-3.5 w-3.5" />
            Ke dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
