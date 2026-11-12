import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: `API and AI agents · ${SITE_NAME}`, template: `%s · ${SITE_NAME}` },
  description: "Let people, programs and AI agents pay you in NIM or USDT. Plain HTTP and JSON, no API key, verified on-chain.",
};

export default function Layout({ children }: LayoutProps<"/docs">) {
  return children;
}
