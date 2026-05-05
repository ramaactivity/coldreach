import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();

  // First-time user: redirect to onboarding
  if (workspaces.length === 0) {
    redirect("/onboarding/workspace");
  }

  // Single workspace: skip the cross-workspace dashboard, go straight to it
  if (workspaces.length === 1) {
    redirect(`/w/${workspaces[0].slug}/dashboard`);
  }

  // Multi-workspace: show aggregate cross-workspace dashboard
  return (
    <>
      <SimpleTopbar email={user.email ?? ""} />
      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Semua Workspace
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Aggregate view dari {workspaces.length} workspace lu. Klik salah satu untuk masuk.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link
              key={ws.id}
              href={`/w/${ws.slug}/dashboard`}
              className="group rounded-lg border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: ws.color_theme }}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
                  {ws.business_type ?? "—"}
                </span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-zinc-900 transition group-hover:text-zinc-950 dark:text-zinc-100 dark:group-hover:text-zinc-50">
                {ws.name}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                Schedule: {ws.schedule_start_time.slice(0, 5)} – {ws.schedule_end_time.slice(0, 5)} WIB · {ws.daily_target}/hari
              </p>
            </Link>
          ))}

          <Link
            href="/onboarding/workspace"
            className="flex items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm text-zinc-600 transition hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:bg-zinc-900"
          >
            + Tambah Workspace
          </Link>
        </div>
      </main>
    </>
  );
}
