import "server-only";
import { siteUrl } from "./site";

/**
 * The origin the visitor used ("https://nimbill.example"), from the request's Host headers.
 * Unlike request.url, this is right behind proxies and when the dev server listens on 0.0.0.0.
 */
export function requestOrigin(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteUrl().origin;
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
