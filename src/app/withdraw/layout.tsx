import type { Metadata } from "next";

export const metadata: Metadata = { title: "Withdraw" };

export default function Layout({ children }: LayoutProps<"/withdraw">) {
  return children;
}
