import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    // next dev does not run the Cloudflare router. Use the same browser-driven
    // detail shell so pending and newly added records work before a rebuild.
    return {
      beforeFiles: ["shops", "brands", "breweries"].map((type) => ({
        source: `/${type}/:id`,
        destination: "/detail-shell",
      })),
    };
  },
};
export default config;
