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
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-secondary">
            {isFirstTime ? (
              <Sparkles className="h-3 w-3 text-muted" />
            ) : (
              <Plus className="h-3 w-3 text-muted" />
            )}
            <span>
              {isFirstTime ? "Onboarding — Step 1" : "Tambah Workspace"}
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {isFirstTime ? "Buat Workspace Pertama" : "Buat Workspace Baru"}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            Workspace = 1 bisnis lu. Database kontak shared antar workspace,
            tapi template, campaign, dan pipeline terpisah per bisnis.
          </p>
          {isFirstTime && (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Mulai dengan bisnis utama dulu (rekomendasi: Tiska Catering).
              Workspace lain bisa ditambah lewat sidebar setelah ini.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <CreateWorkspaceForm />
        </div>
      </main>
    </>
  );
}
