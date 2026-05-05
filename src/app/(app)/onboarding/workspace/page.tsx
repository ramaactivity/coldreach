import { createClient } from "@/lib/supabase/server";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OnboardingWorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const workspaces = await getUserWorkspaces();
  const isFirstTime = workspaces.length === 0;

  return (
    <>
      <SimpleTopbar email={user?.email ?? ""} />
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {isFirstTime ? "Onboarding — Step 1" : "Tambah Workspace"}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {isFirstTime ? "Buat Workspace Pertama" : "Buat Workspace Baru"}
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Workspace = 1 bisnis Anda. Database kontak shared antar workspace,
            tapi template, campaign, dan pipeline terpisah per bisnis.
          </p>
          {isFirstTime && (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-500">
              Mulai dengan bisnis utama Anda dulu (rekomendasi: Tiska Catering).
              Workspace lain bisa ditambah nanti via menu Workspace di topbar.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <CreateWorkspaceForm />
        </div>
      </main>
    </>
  );
}
