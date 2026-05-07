import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 6 MB to accommodate 5 MB max attachment file + FormData overhead
      bodySizeLimit: "6mb",
    },
    // Client Router Cache. Next 16 default is dynamic:0 = re-fetch every nav,
    // so even a page just visited reloads from scratch when you click back to
    // it. Bumping dynamic to 60s makes nav feel instant for recently-visited
    // pages while still being fresh enough not to show stale data after edits
    // (server actions revalidatePath bypasses this anyway).
    staleTimes: {
      dynamic: 60,
      static: 180,
    },
    // Tree-shake the icon + Supabase imports so the client bundle doesn't
    // ship every unused export. Cuts ~150 kB on first load for the
    // contacts/queues pages which import 20+ icons.
    optimizePackageImports: [
      "lucide-react",
      "@supabase/supabase-js",
      "@supabase/ssr",
      "date-fns",
    ],
  },
  // Strip console.* in production except error/warn so uncaught issues
  // still surface, but every debug log we forgot in prod stops shipping.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default nextConfig;
