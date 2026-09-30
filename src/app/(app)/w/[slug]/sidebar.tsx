"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { UserAvatar, WorkspaceAvatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/lib/workspace-constants";

type NavSubItem = { href: string; label: string };
type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavSubItem[];
};
type NavGroup = { heading: string; items: NavItem[] };

const COLLAPSE_KEY = "cr-sidebar-collapsed";
const COLLAPSE_EVENT = "cr-sidebar-collapse";

/**
 * Rail-mode state backed by localStorage. useSyncExternalStore keeps SSR
 * (always expanded) and the client in sync without a setState-in-effect.
 */
function useCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      window.addEventListener(COLLAPSE_EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(COLLAPSE_EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );
  const toggle = () => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };
  return [collapsed, toggle];
}

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

const subItemClass = (active: boolean) =>
  cn(
    "block rounded-md py-1.5 pl-[34px] pr-2.5 text-[12.5px] font-medium transition-colors",
    active
      ? "bg-action text-on-action"
      : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
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
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "";

  // Rail (icon-only) mode — desktop only, persisted via localStorage.
  const [collapsed, toggleCollapsed] = useCollapsed();

  // Manual expand/collapse overrides for parents with children. Effective
  // expansion falls back to "is this section active?".
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const groups: NavGroup[] = [
    {
      heading: "Overview",
      items: [
        { href: `/w/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
        {
          href: `/w/${slug}/inbox`,
          label: "Inbox",
          icon: Inbox,
          children: [
            { href: `/w/${slug}/inbox`, label: "Belum ditangani" },
            { href: `/w/${slug}/inbox?tab=snoozed`, label: "Ditunda" },
            { href: `/w/${slug}/inbox?tab=handled`, label: "Selesai" },
          ],
        },
        { href: `/w/${slug}/pipeline`, label: "Pipeline", icon: Kanban },
      ],
    },
    {
      heading: "Outreach",
      items: [
        {
          href: `/w/${slug}/contacts`,
          label: "Kontak",
          icon: Users,
          children: [
            { href: `/w/${slug}/contacts`, label: "Semua kontak" },
            { href: `/w/${slug}/contacts/discover`, label: "Cari Lead (Apollo)" },
            { href: `/w/${slug}/contacts/scrape`, label: "Scrape Website" },
            { href: `/w/${slug}/contacts/companies`, label: "Perusahaan" },
            { href: `/w/${slug}/contacts/duplicates`, label: "Duplikat" },
            { href: `/w/${slug}/contacts/tags`, label: "Tags" },
            { href: `/w/${slug}/contacts/import`, label: "Impor CSV" },
          ],
        },
        { href: `/w/${slug}/templates`, label: "Templates", icon: FileText },
        { href: `/w/${slug}/queues`, label: "Queues", icon: Send },
        { href: `/w/${slug}/campaigns`, label: "Campaigns", icon: Rocket },
      ],
    },
  ];

  // Section (parent prefix) active — covers all sub-routes/tabs.
  function sectionActive(href: string): boolean {
    const base = href.split("?")[0];
    if (base.endsWith("/dashboard")) return pathname === base;
    return pathname === base || pathname.startsWith(base + "/");
  }
  // Exact child match, including ?tab= for the Inbox children.
  function childActive(href: string): boolean {
    const [base, query = ""] = href.split("?");
    if (pathname !== base) return false;
    const want = new URLSearchParams(query).get("tab") ?? "";
    return currentTab === want;
  }

  const settingsHref = `/w/${slug}/settings`;

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200",
        collapsed ? "w-[248px] md:w-[68px]" : "w-[248px]",
      )}
    >
      {/* Brand row + rail toggle */}
      <div
        className={cn(
          "flex items-center px-5 pb-3 pt-5",
          collapsed && "md:justify-center md:px-0",
        )}
      >
        <Link
          href="/dashboard"
          prefetch={true}
          className={cn(
            "group flex items-center gap-2 text-[15px] font-semibold text-ink transition-opacity hover:opacity-80",
            collapsed && "md:hidden",
          )}
        >
          <span className="inline-block size-2 shrink-0 rounded-full bg-accent" />
          <span>ColdReach</span>
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
          className="ml-auto hidden size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-ink md:inline-flex"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Workspace switcher — full when expanded, avatar-only in rail mode */}
      <div className={cn("px-3 pb-3", collapsed && "md:hidden")}>
        <WorkspaceSwitcher current={workspace} workspaces={workspaces} />
      </div>
      {collapsed && (
        <div className="hidden justify-center pb-3 md:flex">
          <WorkspaceAvatar
            initial={workspace.name[0]}
            className="size-7 text-[11px]"
          />
        </div>
      )}

      {/* Nav — overflow must stay visible in rail mode so flyouts can escape. */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          collapsed && "md:overflow-visible",
        )}
      >
        {groups.map((group, gi) => (
          <div key={group.heading} className={gi > 0 ? "mt-5" : ""}>
            <p
              className={cn(
                "label-eyebrow mb-1.5 px-2.5 text-faint",
                collapsed && "md:hidden",
              )}
            >
              {group.heading}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const hasChildren = !!item.children?.length;
                const secActive = sectionActive(item.href);
                const anyChildActive =
                  hasChildren && item.children!.some((c) => childActive(c.href));
                // A leaf, or a parent whose own landing page is the active route
                // (no more-specific child), gets the strong pill.
                const selfPill = hasChildren
                  ? secActive && !anyChildActive && pathname === item.href.split("?")[0]
                  : secActive;
                const expanded = overrides[item.href] ?? secActive;

                return (
                  <li
                    key={item.href}
                    className="group/navitem relative"
                  >
                    <div className="flex items-center">
                      <Link
                        href={item.href}
                        prefetch={true}
                        aria-current={selfPill ? "page" : undefined}
                        className={cn(
                          navItemClass(selfPill),
                          "flex-1",
                          // Soft section-active when a child carries the pill.
                          secActive && !selfPill && "text-ink",
                          collapsed && "md:justify-center md:px-0",
                        )}
                      >
                        <Icon className={navIconClass(selfPill)} />
                        <span className={cn("truncate", collapsed && "md:hidden")}>
                          {item.label}
                        </span>
                      </Link>
                      {hasChildren && (
                        <button
                          type="button"
                          aria-label={expanded ? "Tutup sub-menu" : "Buka sub-menu"}
                          aria-expanded={expanded}
                          onClick={() =>
                            setOverrides((o) => ({ ...o, [item.href]: !expanded }))
                          }
                          className={cn(
                            "ml-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-surface-hover hover:text-ink",
                            collapsed && "md:hidden",
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              "h-3.5 w-3.5 transition-transform",
                              expanded && "rotate-90",
                            )}
                          />
                        </button>
                      )}
                    </div>

                    {/* Inline sub-menu (expanded mode + mobile) */}
                    {hasChildren && (
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200",
                          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                          collapsed && "md:hidden",
                        )}
                      >
                        <ul className="overflow-hidden">
                          {item.children!.map((c) => (
                            <li key={c.href + c.label}>
                              <Link
                                href={c.href}
                                prefetch={true}
                                aria-current={childActive(c.href) ? "page" : undefined}
                                className={subItemClass(childActive(c.href))}
                              >
                                {c.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Rail flyout (collapsed + md+ only) */}
                    <div
                      className={cn(
                        "absolute left-full top-0 z-50 ml-2 hidden min-w-[180px] rounded-lg border border-border bg-surface p-1.5 shadow-[var(--shadow-lg)]",
                        collapsed &&
                          "md:group-hover/navitem:block md:group-focus-within/navitem:block",
                      )}
                    >
                      <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                        {item.label}
                      </p>
                      {hasChildren ? (
                        <ul>
                          {item.children!.map((c) => (
                            <li key={"fly" + c.href + c.label}>
                              <Link
                                href={c.href}
                                className={cn(
                                  "block rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                                  childActive(c.href)
                                    ? "bg-action text-on-action"
                                    : "text-ink-secondary hover:bg-surface-hover hover:text-ink",
                                )}
                              >
                                {c.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Link
                          href={item.href}
                          className="block rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
                        >
                          Buka {item.label}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Settings */}
      <div className="px-3 pb-2 pt-1">
        <Link
          href={settingsHref}
          prefetch={true}
          aria-current={sectionActive(settingsHref) ? "page" : undefined}
          className={cn(
            navItemClass(sectionActive(settingsHref)),
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <SettingsIcon className={navIconClass(sectionActive(settingsHref))} />
          <span className={cn("truncate", collapsed && "md:hidden")}>Pengaturan</span>
        </Link>
      </div>

      {/* Account footer */}
      <div className="mt-auto border-t border-border px-3 py-3">
        <div
          className={cn(
            "flex items-center gap-2.5 px-2 py-1.5",
            collapsed && "md:justify-center md:px-0",
          )}
        >
          <UserAvatar
            initial={userEmail[0]?.toUpperCase() ?? "U"}
            className="size-7 text-[11px]"
          />
          <p
            className={cn(
              "min-w-0 flex-1 truncate text-[11px] leading-tight text-ink-secondary",
              collapsed && "md:hidden",
            )}
          >
            {userEmail}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className={cn(
              "mt-1 flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-surface-hover hover:text-ink",
              collapsed && "md:justify-center md:px-0",
            )}
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className={cn(collapsed && "md:hidden")}>Keluar</span>
          </button>
        </form>
      </div>
    </aside>
  );
}
