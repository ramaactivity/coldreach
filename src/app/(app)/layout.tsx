import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared layout for authenticated pages. The proxy.ts at root already
 * redirects unauth users to /login, but we also fetch the user here so
 * that child pages can rely on `user` being non-null.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar email={user.email ?? ""} />
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Topbar({ email }: { email: string }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          ColdReach
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{email}</span>
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
