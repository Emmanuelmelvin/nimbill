import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local dev database) ships WASM + data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
  // Allow loading the dev server from a phone on the LAN (Nimiq Pay "Custom URL").
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
