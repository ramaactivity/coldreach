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
        className="group flex w-full items-center gap-2.5 rounded-lg border border-zinc-200/80 bg-white px-2.5 py-2 text-sm text-zinc-900 shadow-sm transition-all hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
      >
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase text-white shadow-sm"
          style={{ backgroundColor: current.color_theme }}
        >
          {current.name[0]}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold leading-tight">
            {current.name}
          </p>
          <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
            {current.business_type ?? "workspace"}
          </p>
        </div>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-zinc-200/80 bg-white py-1 shadow-lg shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Workspaces
          </div>
          {workspaces.map((ws) => {
            const isCurrent = ws.id === current.id;
            return (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}/dashboard`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  isCurrent
                    ? "font-medium text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase text-white"
                  style={{ backgroundColor: ws.color_theme }}
                >
                  {ws.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm leading-tight">{ws.name}</p>
                  <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                    {ws.business_type ?? "workspace"}
                  </p>
                </div>
                {isCurrent && (
                  <Check className="h-3.5 w-3.5 shrink-0 text-zinc-700 dark:text-zinc-300" />
                )}
              </Link>
            );
          })}
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <Link
              href="/onboarding/workspace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-2.5 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                <Plus className="h-3 w-3" />
              </div>
              <span>Tambah Workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
