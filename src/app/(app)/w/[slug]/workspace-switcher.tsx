"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ChevronsUpDown, Check, Plus } from "lucide-react";
import { WorkspaceAvatar } from "@/components/ui";
import { accentFromColorTheme, type Workspace } from "@/lib/workspace-constants";
import { cn } from "@/lib/utils";

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
        className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        <WorkspaceAvatar
          initial={current.name[0]}
          className="size-7 text-[11px]"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-ink">
            {current.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted">
            {current.business_type ?? "workspace"}
          </p>
        </div>
        <ChevronsUpDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-faint transition-transform group-hover:text-muted",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-md)]"
          role="listbox"
        >
          <div className="label-eyebrow px-2.5 pb-1 pt-1.5 text-faint">
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
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                    isCurrent
                      ? "bg-accent-soft text-accent-text"
                      : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
                  )}
                >
                  {/* Each workspace shows its own preset accent via data-accent. */}
                  <span data-accent={accentFromColorTheme(ws.color_theme)}>
                    <WorkspaceAvatar
                      initial={ws.name[0]}
                      className="size-7 text-[11px]"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium leading-tight">
                      {ws.name}
                    </p>
                    <p className="truncate text-[11px] leading-tight text-muted">
                      {ws.business_type ?? "workspace"}
                    </p>
                  </div>
                  {isCurrent && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" />
                  )}
                </Link>
              );
            })}
          </div>
          <div className="mt-1 border-t border-border pt-1">
            <Link
              href="/onboarding/workspace"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <div className="grid size-7 shrink-0 place-items-center rounded-md border border-dashed border-border-strong text-faint">
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
