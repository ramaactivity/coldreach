import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static, _next/image, favicon, sitemap, robots, image files
     * - api/cron/*       — guarded by X-Cron-Secret; no Supabase session needed
     * - api/track/*      — public tracking pixels hit by recipients' inboxes;
     *                      every Supabase auth check here is wasted CPU and
     *                      breaks the pixel (without this exclusion the pixel
     *                      route would 307 to /login on cold hits)
     * - unsubscribe/*    — token-based public route, no session needed
     *
     * Auth public routes (/login, /auth/*) still pass through and are
     * handled inside updateSession.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/cron|api/track|unsubscribe|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
