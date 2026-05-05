import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces, getWorkspaceBySlug } from "@/lib/workspaces";
import { WorkspaceSwitcher } from "./workspace-switcher";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const workspace = await getWorkspaceBySlug(slug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const allWorkspaces = await getUserWorkspaces();

  // Update last_active_workspace_id (fire and forget)
  await supabase
    .from("users")
    .update({ last_active_workspace_id: workspace.id })
    .eq("id", user.id);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            ColdReach
          </Link>
          <span className="text-zinc-300 dark:text-zinc-700">/</span>
          <WorkspaceSwitcher
            current={workspace}
            workspaces={allWorkspaces}
          />
        </div>
        <nav className="flex items-center gap-3">
          <NavLink href={`/w/${slug}/dashboard`}>Dashboard</NavLink>
          <NavLink href={`/w/${slug}/contacts`}>Contacts</NavLink>
          <NavLink href={`/w/${slug}/templates`}>Templates</NavLink>
          <NavLink href={`/w/${slug}/queues`}>Queues</NavLink>
          <NavLink href={`/w/${slug}/pipeline`}>Pipeline</NavLink>
          <NavLink href={`/w/${slug}/settings`}>Settings</NavLink>
          <span className="ml-3 text-xs text-zinc-500 dark:text-zinc-500">
            {user.email}
          </span>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-zinc-700 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}
