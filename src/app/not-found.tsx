import Link from "next/link";
import { Compass, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/60 dark:bg-zinc-900 dark:ring-zinc-800/60">
          <Compass className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
          404
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.022em] text-zinc-950 dark:text-zinc-50">
          Halaman gak ketemu
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          URL yang lu buka udah pindah, ke-delete, atau emang gak pernah ada.
          Balik ke dashboard aja.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 text-[13px] font-medium text-zinc-50 shadow-[0_1px_2px_0_rgb(0_0_0/0.08)] transition-all duration-150 hover:bg-zinc-800 hover:shadow-[0_2px_6px_-1px_rgb(0_0_0/0.12)] active:scale-[0.97] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <Home className="h-3.5 w-3.5" />
          Ke dashboard
        </Link>
      </div>
    </div>
  );
}
