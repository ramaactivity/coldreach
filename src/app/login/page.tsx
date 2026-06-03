import { Suspense } from "react";
import { Sparkles } from "lucide-react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-surface-sunken px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-secondary">
            <Sparkles className="h-3 w-3 text-muted" />
            <span>Cold email · automated · multi-workspace</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            ColdReach
          </h1>
          <p className="mt-2 text-sm text-muted">
            Setup sekali, sistem kirim email otomatis tiap hari.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <Suspense fallback={<LoginFormFallback />}>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          Login pakai akun Google. App ini lagi Testing mode — pastikan email
          lu udah di-add ke test users di Google Cloud.
        </p>
      </div>
    </main>
  );
}

function LoginFormFallback() {
  return (
    <div className="flex h-10 w-full items-center justify-center rounded-lg bg-surface-sunken text-sm text-muted">
      Memuat...
    </div>
  );
}
