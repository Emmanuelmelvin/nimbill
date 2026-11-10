import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local dev database) ships WASM + data files that must not be bundled; winston loads
  // its transports dynamically and runs best unbundled on the server.
  serverExternalPackages: ["@electric-sql/pglite", "winston", "winston-transport"],
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

// Sentry build integration. Source maps are uploaded only when SENTRY_AUTH_TOKEN is set (CI / Vercel).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  // Browser events go through our own domain (/monitoring) so ad blockers don't drop them.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
