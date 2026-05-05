import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            ColdReach
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Cold email automation untuk multi-workspace business
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-xs text-zinc-500 dark:text-zinc-500">
          Login pakai akun Google. App ini lagi Testing mode — pastikan email lu
          udah di-add ke test users di Google Cloud.
        </p>
      </div>
    </main>
  );
}

function LoginFormFallback() {
  return (
    <div className="flex w-full items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-400 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
      Memuat...
    </div>
  );
}
