import type { Metadata } from "next";

export const metadata: Metadata = { title: "Products" };

export default function Layout({ children }: LayoutProps<"/board/products">) {
  return children;
}
