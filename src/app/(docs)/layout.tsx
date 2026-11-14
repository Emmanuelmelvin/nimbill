import type { Metadata } from "next";
import { DocsShell } from "@/components/docs/DocsShell";
import { SITE_NAME } from "@/lib/site";

// /docs, /ai and /mcp share one docs frame (sidebar, search, "On this page"). The route group
// keeps the URLs as they were.
export const metadata: Metadata = {
  title: { default: `${SITE_NAME} Docs`, template: `%s · ${SITE_NAME} Docs` },
  description: "Let people, programs and AI agents pay you in NIM or USDT. Plain HTTP and JSON, no API key, verified on-chain.",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return <DocsShell>{children}</DocsShell>;
}
