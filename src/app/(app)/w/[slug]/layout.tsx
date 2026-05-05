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
