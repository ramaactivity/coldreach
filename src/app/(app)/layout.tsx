import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Minimal auth gate for all (app) pages. No topbar here — each section
 * (dashboard, onboarding, /w/[slug]) provides its own topbar so the
 * workspace switcher can live inline with the workspace context.
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

  if (!user) redirect("/login");

  return <div className="flex min-h-full flex-col">{children}</div>;
}
