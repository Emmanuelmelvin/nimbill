import type { Metadata } from "next";
import { baseOpenGraph } from "@/lib/site";

const description = "Invoices paid with NimBill. Every payment links to its public blockchain transaction.";

export const metadata: Metadata = {
  title: "Stats",
  description,
  openGraph: { ...baseOpenGraph, title: "NimBill in numbers", description, url: "/stats" },
  twitter: { card: "summary_large_image", title: "NimBill in numbers", description },
};

export default function Layout({ children }: LayoutProps<"/stats">) {
  return children;
}
