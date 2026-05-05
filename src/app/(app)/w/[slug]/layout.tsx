import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces, getWorkspaceBySlug } from "@/lib/workspaces";
import { Sidebar } from "./sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Resolve params and auth in parallel
  const supabase = await createClient();
  const [{ slug }, userResult] = await Promise.all([
    params,
    supabase.auth.getUser(),
  ]);
  const { data: { user } } = userResult;
  if (!user) redirect("/login");

  // Fetch workspace + workspaces list in parallel (React.cache'd)
  const [workspace, allWorkspaces] = await Promise.all([
    getWorkspaceBySlug(slug),
    getUserWorkspaces(),
  ]);
  if (!workspace) notFound();

  // Fire-and-forget: non-blocking write for last_active_workspace_id
  void supabase
    .from("users")
    .update({ last_active_workspace_id: workspace.id })
    .eq("id", user.id)
    .then(() => {}, () => {});

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        slug={slug}
        workspace={workspace}
        workspaces={allWorkspaces}
        userEmail={user.email ?? ""}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
