"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FileText,
  Send,
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
    {
      href: `/w/${slug}/dashboard`,
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    { href: `/w/${slug}/contacts`, label: "Contacts", icon: Users },
    { href: `/w/${slug}/templates`, label: "Templates", icon: FileText },
    { href: `/w/${slug}/queues`, label: "Queues", icon: Send },
    { href: `/w/${slug}/pipeline`, label: "Pipeline", icon: Kanban },
    { href: `/w/${slug}/settings`, label: "Settings", icon: SettingsIcon },
  ];

  function isActive(href: string): boolean {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Brand */}
      <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <Link
          href="/dashboard"
          className="block text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
        >
          ColdReach
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
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
                  className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                    active
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
        <div className="mb-2 flex items-center gap-2 px-1">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium uppercase text-zinc-50"
            style={{ backgroundColor: workspace.color_theme }}
          >
            {userEmail[0]?.toUpperCase() ?? "U"}
          </div>
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {userEmail}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
