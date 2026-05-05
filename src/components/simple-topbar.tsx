import Link from "next/link";

export function SimpleTopbar({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <Link
        href="/dashboard"
        className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
      >
        ColdReach
      </Link>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-500">{email}</span>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
