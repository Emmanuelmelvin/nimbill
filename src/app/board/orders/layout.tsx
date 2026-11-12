import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders" };

export default function Layout({ children }: LayoutProps<"/board/orders">) {
  return children;
}
