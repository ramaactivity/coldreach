import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-4 py-16">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-surface-sunken">
          <Compass className="h-5 w-5 text-muted" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          404
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em] text-ink">
          Halaman gak ketemu
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          URL yang lu buka udah pindah, ke-delete, atau emang gak pernah ada.
          Balik ke dashboard aja.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-md bg-action px-3.5 text-[13px] font-medium text-on-action transition-colors hover:bg-action-hover"
        >
          <Home className="h-3.5 w-3.5" />
          Ke dashboard
        </Link>
      </div>
    </div>
  );
}
