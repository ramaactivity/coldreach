"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Users,
  FileText,
  Send,
  Rocket,
  Kanban,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { WorkspaceSwitcher } from "./workspace-switcher";
import type { Workspace } from "@/lib/workspace-constants";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function Sidebar({
  slug,
  workspace,
  workspaces,
  userEmail,
}: {
  slug: string;
  workspace: Workspace;
  workspaces: Workspace[];
  userEmail: string;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: `/w/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { href: `/w/${slug}/inbox`, label: "Inbox", icon: Inbox },
    { href: `/w/${slug}/contacts`, label: "Contacts", icon: Users },
    { href: `/w/${slug}/templates`, label: "Templates", icon: FileText },
    { href: `/w/${slug}/queues`, label: "Queues", icon: Send },
    { href: `/w/${slug}/campaigns`, label: "Campaigns", icon: Rocket },
    { href: `/w/${slug}/pipeline`, label: "Pipeline", icon: Kanban },
    { href: `/w/${slug}/settings`, label: "Settings", icon: SettingsIcon },
  ];

  function isActive(href: string): boolean {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="relative flex w-60 shrink-0 flex-col border-r border-zinc-200/80 bg-white dark:border-zinc-800/80 dark:bg-zinc-950">
      {/* Subtle workspace color accent at top */}
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ backgroundColor: workspace.color_theme }}
      />

      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-zinc-200/80 px-4 py-3.5 dark:border-zinc-800/80">
        <Link
          href="/dashboard"
          prefetch={true}
          className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-zinc-900 transition-colors hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: workspace.color_theme }}
          />
          <span>ColdReach</span>
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="border-b border-zinc-200/80 px-3 py-3 dark:border-zinc-800/80">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={true}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all ${
                    active
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800/60 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full"
                      style={{ backgroundColor: workspace.color_theme }}
                    />
                  )}
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-zinc-200/80 px-3 py-3 dark:border-zinc-800/80">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase text-white shadow-sm ring-2 ring-white dark:ring-zinc-900"
            style={{ backgroundColor: workspace.color_theme }}
          >
            {userEmail[0]?.toUpperCase() ?? "U"}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">
            {userEmail}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
