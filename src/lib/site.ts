// Site-wide identity used in <head> metadata and Open Graph / Twitter link previews.
import { env } from "./env";

export const SITE_NAME = "NimBill";
export const SITE_TITLE = "NimBill — invoices paid in NIM & USDT";
export const SITE_DESCRIPTION = "Invoice clients in your local currency. Get paid in NIM or USDT, straight to your Nimiq Pay wallet, verified on-chain.";

/**
 * Absolute base URL for link previews (og:image etc. must be absolute).
 * SITE_URL wins; on Vercel the production domain is used; otherwise local dev.
 */
export function siteUrl(): URL {
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  return new URL(env.SITE_URL || (vercel ? `https://${vercel}` : `http://localhost:${env.PORT || 3000}`));
}

/** Shared Open Graph fields. Child routes that set `openGraph` replace the parent's, so spread this in. */
export const baseOpenGraph = { siteName: SITE_NAME, type: "website", locale: "en_US" } as const;
