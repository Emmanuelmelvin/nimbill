import { OG_SIZE } from "@/lib/og";
import { pageOgImage } from "@/lib/og-page";

// Setting openGraph in this page's metadata drops the inherited share image, so it has its own.
export const alt = "NimBill Terms: The short version, in plain words.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return pageOgImage({ label: "Terms", title: "The short version, in plain words." });
}
