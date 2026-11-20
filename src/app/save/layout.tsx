import type { Metadata } from "next";

export const metadata: Metadata = { title: "Goals" };

export default function Layout({ children }: LayoutProps<"/save">) {
  return children;
}
