import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-zinc-50 px-6 py-12 dark:bg-zinc-950">
      {/* Background gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-gradient-to-br from-orange-200/30 via-rose-200/20 to-violet-200/30 blur-3xl dark:from-orange-500/10 dark:via-rose-500/5 dark:to-violet-500/10" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-blue-200/30 to-emerald-200/20 blur-3xl dark:from-blue-500/10 dark:to-emerald-500/5" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/60 px-3 py-1 text-xs font-medium text-zinc-700 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>Cold email · automated · multi-workspace</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            ColdReach
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Setup sekali, sistem kirim email otomatis tiap hari.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-sm dark:border-zinc-800/80 dark:bg-zinc-900/80">
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
          Login pakai akun Google. App ini lagi Testing mode — pastikan email
          lu udah di-add ke test users di Google Cloud.
        </p>
      </div>
    </main>
  );
}

function LoginFormFallback() {
  return (
    <div className="flex h-10 w-full items-center justify-center rounded-lg bg-zinc-100 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
      Memuat...
    </div>
  );
}
