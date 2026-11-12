import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pay an invoice" };

export default function Layout({ children }: LayoutProps<"/pay">) {
  return children;
}
