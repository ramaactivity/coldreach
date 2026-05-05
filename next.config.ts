import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 6 MB to accommodate 5 MB max attachment file + FormData overhead
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
