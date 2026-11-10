import type { Metadata } from "next";
import { formatFiat } from "@/lib/currencies";
import { getInvoice } from "@/lib/invoices";
import { baseOpenGraph } from "@/lib/site";

// Title and link preview for an invoice, e.g. "Invoice INV-0002 from Ada Studio · NimBill".
// Only shows what the public invoice page shows anyway (no client email).
export async function generateMetadata({ params }: LayoutProps<"/i/[id]">): Promise<Metadata> {
  const { id } = await params;
  const inv = await getInvoice(id).catch(() => null);
  // A plain string title here would drop the root " · NimBill" template for the receipt page below,
  // so pass the template on explicitly.
  if (!inv) return { title: { default: "Invoice not found", template: "%s · NimBill" } };
  const title = `Invoice ${inv.number} from ${inv.merchantName}`;
  const description =
    inv.status === "paid"
      ? `${formatFiat(inv.total, inv.currency)} · Paid`
      : `${formatFiat(inv.total, inv.currency)} · Pay with NIM${inv.merchantEvmAddress ? " or USDT" : ""} in Nimiq Pay`;
  return {
    title: { default: title, template: "%s · NimBill" },
    description,
    // Share image: ./opengraph-image.tsx
    openGraph: { ...baseOpenGraph, title, description, url: `/i/${id}` },
    twitter: { card: "summary_large_image", title, description },
    // Invoices are private links: keep them out of search engines.
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }: LayoutProps<"/i/[id]">) {
  return children;
}
