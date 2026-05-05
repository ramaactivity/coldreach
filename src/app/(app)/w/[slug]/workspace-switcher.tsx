"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import type { Workspace } from "@/lib/workspace-constants";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: Workspace;
  workspaces: Workspace[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: current.color_theme }}
        />
        <span className="min-w-0 flex-1 truncate text-left font-medium">
          {current.name}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
            Workspaces
          </div>
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/w/${ws.slug}/dashboard`}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                ws.id === current.id
                  ? "font-medium text-zinc-900 dark:text-zinc-100"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: ws.color_theme }}
              />
              <span className="min-w-0 flex-1 truncate">{ws.name}</span>
              {ws.id === current.id && (
                <Check className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              )}
            </Link>
          ))}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/onboarding/workspace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span>Tambah Workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
