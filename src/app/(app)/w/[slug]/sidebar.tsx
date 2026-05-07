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

type NavGroup = {
  heading: string;
  items: NavItem[];
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

  // Two semantic groups so the column has rhythm rather than a single
  // 8-item run that visually disconnects from the footer.
  const groups: NavGroup[] = [
    {
      heading: "Overview",
      items: [
        { href: `/w/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
        { href: `/w/${slug}/inbox`, label: "Inbox", icon: Inbox },
        { href: `/w/${slug}/pipeline`, label: "Pipeline", icon: Kanban },
      ],
    },
    {
      heading: "Outreach",
      items: [
        { href: `/w/${slug}/contacts`, label: "Contacts", icon: Users },
        { href: `/w/${slug}/templates`, label: "Templates", icon: FileText },
        { href: `/w/${slug}/queues`, label: "Queues", icon: Send },
        { href: `/w/${slug}/campaigns`, label: "Campaigns", icon: Rocket },
      ],
    },
  ];

  function isActive(href: string): boolean {
    if (href.endsWith("/dashboard")) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const settingsHref = `/w/${slug}/settings`;
  const settingsActive = isActive(settingsHref);

  return (
    <aside className="relative flex w-[244px] shrink-0 flex-col border-r border-zinc-200/70 bg-white/80 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/80">
      {/* Workspace color accent — top hairline + soft glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: workspace.color_theme, opacity: 0.5 }}
      />
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-[0.05] blur-3xl"
        style={{ backgroundColor: workspace.color_theme }}
      />

      {/* Brand row */}
      <div className="relative flex items-center px-5 pb-3 pt-5">
        <Link
          href="/dashboard"
          prefetch={true}
          className="group flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900 transition-opacity hover:opacity-80 dark:text-zinc-50"
        >
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inset-0 animate-ping rounded-full opacity-60"
              style={{ backgroundColor: workspace.color_theme }}
            />
            <span
              className="relative inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: workspace.color_theme }}
            />
          </span>
          <span>ColdReach</span>
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="relative px-3 pb-3">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>

      {/* Nav with grouping */}
      <nav className="relative flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group, gi) => (
          <div key={group.heading} className={gi > 0 ? "mt-5" : ""}>
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={true}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150 ${
                        active
                          ? "bg-zinc-900 text-white shadow-sm shadow-zinc-900/10 dark:bg-zinc-100 dark:text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
                      }`}
                    >
                      <Icon
                        className={`h-[15px] w-[15px] shrink-0 transition-colors ${
                          active
                            ? ""
                            : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
                        }`}
                      />
                      <span className="truncate font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings + footer cluster — one visual block, no orphaned divider */}
      <div className="relative px-3 pb-3 pt-2">
        <Link
          href={settingsHref}
          prefetch={true}
          aria-current={settingsActive ? "page" : undefined}
          className={`group mb-2 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-all duration-150 ${
            settingsActive
              ? "bg-zinc-900 text-white shadow-sm shadow-zinc-900/10 dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-100/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
          }`}
        >
          <SettingsIcon
            className={`h-[15px] w-[15px] shrink-0 transition-colors ${
              settingsActive
                ? ""
                : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-300"
            }`}
          />
          <span className="truncate font-medium">Settings</span>
        </Link>

        <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/40 p-1.5 dark:border-zinc-800/60 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2.5 px-1.5 py-1">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase text-white shadow-sm ring-2 ring-white dark:ring-zinc-900"
              style={{ backgroundColor: workspace.color_theme }}
            >
              {userEmail[0]?.toUpperCase() ?? "U"}
            </div>
            <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-zinc-700 dark:text-zinc-300">
              {userEmail}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-500 transition-all hover:bg-white hover:text-zinc-900 hover:shadow-sm dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
