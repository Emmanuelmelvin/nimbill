import type { Metadata } from "next";

export const metadata: Metadata = { title: "Save" };

export default function Layout({ children }: LayoutProps<"/save">) {
  return children;
}
