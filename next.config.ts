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
  },
};

export default nextConfig;
