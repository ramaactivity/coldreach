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
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft">
          <AlertTriangle className="h-5 w-5 text-danger" />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.022em] text-ink">
          Ada yang gak beres
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Halaman ini error. Coba refresh dulu — kalau masih kejadian, kabarin
          dan kasih tau apa yang lu lakukan tepat sebelum ini muncul.
        </p>
        {error.digest && (
          <p className="mt-3 inline-block rounded-md bg-surface-sunken px-2 py-1 font-mono text-[11px] text-muted">
            ref: {error.digest}
          </p>
        )}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-action px-3.5 text-[13px] font-medium text-on-action transition-colors hover:bg-action-hover"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Coba lagi
          </button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium text-ink-secondary transition-colors hover:border-border-strong hover:bg-surface-hover hover:text-ink"
          >
            <Home className="h-3.5 w-3.5" />
            Ke dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
