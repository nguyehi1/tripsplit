import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async redirects() {
    return [
      // Feedback moved from a per-trip screen to /feedback; keep old bookmarks working.
      { source: "/trip/:id/feedback", destination: "/feedback", permanent: true },
    ];
  },
};

export default nextConfig;
