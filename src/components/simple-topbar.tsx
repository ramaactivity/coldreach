import Link from "next/link";
import { Inbox, LogOut } from "lucide-react";

export function SimpleTopbar({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200/80 bg-white/80 px-6 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
      <Link
        href="/dashboard"
        prefetch={true}
        className="text-base font-semibold tracking-tight text-zinc-900 transition-colors hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
      >
        ColdReach
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/inbox"
          prefetch={true}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <Inbox className="h-3 w-3" />
          <span>Inbox</span>
        </Link>
        <span className="hidden text-xs text-zinc-500 sm:block dark:text-zinc-400">
          {email}
        </span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-3 w-3" />
            <span>Sign out</span>
          </button>
        </form>
      </div>
    </header>
  );
}
