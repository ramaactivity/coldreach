"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import {
  accentFromColorTheme,
  type Workspace,
} from "@/lib/workspace-constants";

/**
 * Wraps the sidebar + main content. On md+ screens it renders the
 * standard 2-column layout. On smaller screens the sidebar collapses
 * into a slide-in drawer with a hamburger toggle in a compact topbar.
 *
 * Drawer state is local + auto-closes when the route changes, so a
 * sidebar nav click on mobile feels native.
 */
export function WorkspaceShell({
  sidebar,
  children,
  workspace,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  workspace: Workspace;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer when the route changes (adjust-state-during-render
  // pattern — avoids a cascading render from setState inside an effect).
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Lock body scroll while drawer is open on mobile
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <div
      data-accent={accentFromColorTheme(workspace.color_theme)}
      className="flex h-screen overflow-hidden"
    >
      {/* Sidebar wrapper:
          - md+: static column, always visible
          - sm:  fixed off-canvas drawer, slides in when open */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-out md:relative md:translate-x-0 md:transition-none ${
          open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {/* Backdrop (mobile only, when drawer open) */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-zinc-950/45 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar — hidden on md+ */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Tutup menu" : "Buka menu"}
            className="inline-flex size-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-hover"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="inline-block size-2 shrink-0 rounded-full bg-accent" />
            <span className="truncate text-sm font-semibold text-ink">
              {workspace.name}
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </main>
      </div>
    </div>
  );
}
