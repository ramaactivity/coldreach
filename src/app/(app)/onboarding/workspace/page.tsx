import { Sparkles, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/session-helpers";
import { getUserWorkspaces } from "@/lib/workspaces";
import { SimpleTopbar } from "@/components/simple-topbar";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function OnboardingWorkspacePage() {
  const [user, workspaces] = await Promise.all([
    getCurrentUser(),
    getUserWorkspaces(),
  ]);
  const isFirstTime = workspaces.length === 0;

  return (
    <>
      <SimpleTopbar email={user?.email ?? ""} />
      <main className="relative mx-auto max-w-2xl px-6 py-12">
        {/* Decorative gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 overflow-hidden"
        >
          <div className="absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-orange-200/30 via-rose-200/20 to-violet-200/20 blur-3xl dark:from-orange-500/10 dark:via-rose-500/5 dark:to-violet-500/5" />
        </div>

        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/80 dark:text-zinc-300">
            {isFirstTime ? (
              <Sparkles className="h-3 w-3 text-amber-500" />
            ) : (
              <Plus className="h-3 w-3 text-zinc-500" />
            )}
            <span>
              {isFirstTime ? "Onboarding — Step 1" : "Tambah Workspace"}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl dark:text-zinc-50">
            {isFirstTime ? "Buat Workspace Pertama" : "Buat Workspace Baru"}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-400">
            Workspace = 1 bisnis lu. Database kontak shared antar workspace,
            tapi template, campaign, dan pipeline terpisah per bisnis.
          </p>
          {isFirstTime && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-500">
              Mulai dengan bisnis utama dulu (rekomendasi: Tiska Catering).
              Workspace lain bisa ditambah lewat sidebar setelah ini.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/80">
          <CreateWorkspaceForm />
        </div>
      </main>
    </>
  );
}
