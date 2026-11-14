import { OG_SIZE } from "@/lib/og";
import { pageOgImage } from "@/lib/og-page";

// Setting openGraph in this page's metadata drops the inherited share image, so it has its own.
export const alt = "NimBill Privacy: What NimBill stores, and why.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return pageOgImage({ label: "Privacy", title: "What NimBill stores, and why." });
}
