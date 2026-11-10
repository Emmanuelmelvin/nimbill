import type { Metadata } from "next";
import { getInvoice } from "@/lib/invoices";

export async function generateMetadata({ params }: LayoutProps<"/i/[id]/receipt">): Promise<Metadata> {
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);
  return { title: inv ? `Receipt for ${inv.number}` : "Receipt" };
}

export default function Layout({ children }: LayoutProps<"/i/[id]/receipt">) {
  return children;
}
