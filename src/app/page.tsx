import { redirect } from "next/navigation";

export default function Home() {
  // Proxy.ts already handles unauth redirects, so authenticated users hitting
  // "/" are redirected to /dashboard. Unauth users would be sent to /login.
  redirect("/dashboard");
}
