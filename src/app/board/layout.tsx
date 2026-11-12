import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

// A title object (not a plain string), so the board's own pages keep the " · NimBill" suffix too.
export const metadata: Metadata = { title: { absolute: `Board · ${SITE_NAME}`, template: `%s · ${SITE_NAME}` } };

export default function Layout({ children }: LayoutProps<"/board">) {
  return children;
}
