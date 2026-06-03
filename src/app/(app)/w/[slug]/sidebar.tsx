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
import { UserAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";
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

const navItemClass = (active: boolean) =>
  cn(
    "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
    active
      ? "bg-action text-on-action"
      : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
  );

const navIconClass = (active: boolean) =>
  cn(
    "h-[15px] w-[15px] shrink-0 transition-colors",
    active ? "" : "text-muted group-hover:text-ink-secondary",
  );

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
    <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand row — 8px accent dot + wordmark */}
      <div className="flex items-center px-5 pb-3 pt-5">
        <Link
          href="/dashboard"
          prefetch={true}
          className="group flex items-center gap-2 text-[15px] font-semibold text-ink transition-opacity hover:opacity-80"
        >
          <span className="inline-block size-2 shrink-0 rounded-full bg-accent" />
          <span>ColdReach</span>
        </Link>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 pb-3">
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>

      {/* Nav with grouping */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group, gi) => (
          <div key={group.heading} className={gi > 0 ? "mt-5" : ""}>
            <p className="label-eyebrow mb-1.5 px-2.5 text-faint">
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
                      className={navItemClass(active)}
                    >
                      <Icon className={navIconClass(active)} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings link sits with the rest of the nav. */}
      <div className="px-3 pb-2 pt-1">
        <Link
          href={settingsHref}
          prefetch={true}
          aria-current={settingsActive ? "page" : undefined}
          className={navItemClass(settingsActive)}
        >
          <SettingsIcon className={navIconClass(settingsActive)} />
          <span className="truncate">Settings</span>
        </Link>
      </div>

      {/* Account footer — anchored to the absolute bottom by mt-auto. */}
      <div className="mt-auto border-t border-border px-3 py-3">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <UserAvatar
            initial={userEmail[0]?.toUpperCase() ?? "U"}
            className="size-7 text-[11px]"
          />
          <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-ink-secondary">
            {userEmail}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
