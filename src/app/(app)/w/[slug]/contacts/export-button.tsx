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
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-ink transition-all duration-150 hover:bg-surface-sunken hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98]"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </a>
  );
}
