import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces, getWorkspaceBySlug } from "@/lib/workspaces";
import { Sidebar } from "./sidebar";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  // Resolve params + auth in parallel; getCurrentUser is cached so any
  // downstream component that calls it again hits the same promise.
  const [{ slug }, user] = await Promise.all([params, requireCurrentUser()]);

  // Fetch workspace + workspaces list in parallel
  // (both backed by unstable_cache: 10 min TTL, tag-invalidated on edit)
  const [workspace, allWorkspaces] = await Promise.all([
    getWorkspaceBySlug(slug),
    getUserWorkspaces(),
  ]);
  if (!workspace) notFound();

  // Fire-and-forget: non-blocking write for last_active_workspace_id
  // (use admin client so this doesn't go through the auth round-trip)
  void createAdminClient()
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
