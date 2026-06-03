import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service role client. Bypasses RLS — use ONLY in trusted server contexts
 * (route handlers, server actions, edge functions, cron jobs).
 *
 * Never expose this to the client. Never log the service role key.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars. Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
