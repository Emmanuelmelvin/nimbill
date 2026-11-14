import { OG_SIZE } from "@/lib/og";
import { pageOgImage } from "@/lib/og-page";

// Setting openGraph in this page's metadata drops the inherited share image, so it has its own.
export const alt = "NimBill Blog: News from NimBill.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return pageOgImage({ label: "Blog", title: "News from NimBill." });
}
