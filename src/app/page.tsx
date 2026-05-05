export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-xl px-8 py-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Phase 0 — Setup Complete
        </div>
        <h1 className="mb-3 text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          ColdReach
        </h1>
        <p className="mb-8 text-base leading-7 text-zinc-600 dark:text-zinc-400">
          Cold email automation multi-workspace.
          <br />
          Setup sekali, sistem kirim email otomatis tiap hari.
        </p>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-left dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Build progress:
          </p>
          <ul className="space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <li className="flex items-center gap-2">
              <span className="text-emerald-500">✓</span>
              <span>Fase 0: Project setup</span>
            </li>
            <li className="flex items-center gap-2 opacity-50">
              <span className="text-zinc-400">○</span>
              <span>Fase 1: Database schema + RLS</span>
            </li>
            <li className="flex items-center gap-2 opacity-50">
              <span className="text-zinc-400">○</span>
              <span>Fase 2: Auth (Google OAuth)</span>
            </li>
            <li className="flex items-center gap-2 opacity-50">
              <span className="text-zinc-400">○</span>
              <span>...</span>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
