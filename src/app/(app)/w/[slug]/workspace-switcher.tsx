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
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="group flex w-full items-center gap-2.5 rounded-xl border border-zinc-200/70 bg-white px-2.5 py-2 text-left shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all duration-150 hover:border-zinc-300 hover:shadow-[0_1px_3px_0_rgb(0_0_0/0.08),0_1px_2px_0_rgb(0_0_0/0.04)] active:scale-[0.99] dark:border-zinc-800/70 dark:bg-zinc-900 dark:hover:border-zinc-700"
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold uppercase text-white shadow-sm"
          style={{ backgroundColor: current.color_theme }}
        >
          {current.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-zinc-900 dark:text-zinc-50">
            {current.name}
          </p>
          <p className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
            {current.business_type ?? "workspace"}
          </p>
        </div>
        <ChevronsUpDown
          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-all duration-200 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-zinc-200/70 bg-white/95 p-1 shadow-[0_8px_24px_-4px_rgb(0_0_0/0.12),0_2px_6px_-2px_rgb(0_0_0/0.06)] backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-900/95"
          role="listbox"
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
            Workspaces
          </div>
          <div className="space-y-0.5">
            {workspaces.map((ws) => {
              const isCurrent = ws.id === current.id;
              return (
                <Link
                  key={ws.id}
                  href={`/w/${ws.slug}/dashboard`}
                  onClick={() => setOpen(false)}
                  role="option"
                  aria-selected={isCurrent}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                    isCurrent
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold uppercase text-white shadow-sm"
                    style={{ backgroundColor: ws.color_theme }}
                  >
                    {ws.name[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">
                      {ws.name}
                    </p>
                    <p className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                      {ws.business_type ?? "workspace"}
                    </p>
                  </div>
                  {isCurrent && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-zinc-700 dark:text-zinc-200" />
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-1 border-t border-zinc-100 pt-1 dark:border-zinc-800">
            <Link
              href="/onboarding/workspace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700">
                <Plus className="h-3.5 w-3.5" />
              </div>
              <span className="font-medium">Tambah Workspace</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
