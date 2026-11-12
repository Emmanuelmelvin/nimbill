import type { Metadata } from "next";

export const metadata: Metadata = { title: "Send money" };

export default function Layout({ children }: LayoutProps<"/send">) {
  return children;
}
