"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";

/**
 * Mirrors the current /contacts URL filters (q, tag, stage, segment, sort)
 * onto the export endpoint so what's visible is what's exported. Uses a
 * native anchor with download attribute — browser handles the file save
 * dialog without any client-side fetch + Blob plumbing.
 */
export function ExportButton({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const params = new URLSearchParams();
  params.set("workspace", slug);
  for (const k of ["q", "tag", "stage", "segment", "sort"] as const) {
    const v = sp.get(k);
    if (v) params.set(k, v);
  }

  return (
    <a
      href={`/api/export/contacts?${params.toString()}`}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition-all duration-150 hover:bg-zinc-50 hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:hover:border-zinc-700"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </a>
  );
}
