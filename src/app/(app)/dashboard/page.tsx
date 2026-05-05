import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Phase 2 — Auth Working
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        Selamat datang, {user?.email}
      </h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Login berhasil. Dashboard sebenarnya akan dibuat di Fase 11. Untuk sekarang ini placeholder.
      </p>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Build progress:
        </p>
        <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span>Fase 0: Project setup</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span>Fase 1: Database schema (17 tables) + RLS</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-emerald-500">✓</span>
            <span>Fase 2: Auth (Google OAuth) — lu sekarang di sini!</span>
          </li>
          <li className="flex items-center gap-2 opacity-50">
            <span className="text-zinc-400">○</span>
            <span>Fase 2.5: Multi-workspace foundation</span>
          </li>
          <li className="flex items-center gap-2 opacity-50">
            <span className="text-zinc-400">○</span>
            <span>...</span>
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
        <p className="font-medium text-zinc-700 dark:text-zinc-300">User info:</p>
        <pre className="mt-2 overflow-x-auto text-zinc-500 dark:text-zinc-400">
{JSON.stringify(
  { id: user?.id, email: user?.email, provider: user?.app_metadata?.provider },
  null,
  2,
)}
        </pre>
      </div>
    </main>
  );
}
