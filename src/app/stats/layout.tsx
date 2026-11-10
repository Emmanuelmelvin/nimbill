import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stats",
  description: "Invoices paid with NimBill. Every payment links to its public blockchain transaction.",
};

export default function Layout({ children }: LayoutProps<"/stats">) {
  return children;
}
