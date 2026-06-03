import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";

/**
 * Memoized per-request user lookup.
 * Without this, every Server Component / layout / page that calls
 * `supabase.auth.getUser()` triggers its own network round-trip to the
 * Supabase auth server (~100-200ms each). Wrapping in React.cache()
 * collapses every call within a single request into one roundtrip.
 *
 * Use this in any read-path render tree. For server actions where you
 * already do strict validation, calling `supabase.auth.getUser()` directly
 * is fine.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Same as above but redirects to /login when no user.
 * Convenience for pages that require auth.
 */
export const requireCurrentUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});
