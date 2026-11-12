import type { Metadata } from "next";
import { getCheque, publicChequeView } from "@/lib/cheques";
import { formatAsset, formatFiat } from "@/lib/currencies";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata({ params }: LayoutProps<"/c/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await getCheque(id).catch(() => null);
  if (!row) return { title: `Cheque not found · ${SITE_NAME}` };
  const c = await publicChequeView(row);
  const amount = c.currency === "NIM" ? formatAsset(c.amount, "NIM") : formatFiat(c.fiatAmount, c.currency);
  const title = `Cheque from ${c.writer.name} · ${amount}`;
  const description =
    c.recipient.kind === "tag"
      ? `Payable to ${c.recipient.handle}${c.note ? ` · "${c.note}"` : ""}. Cash it in Nimiq Pay.`
      : `Free cheque (${amount})${c.note ? ` · "${c.note}"` : ""}. First to claim gets it.`;
  return {
    title: `${title} · ${SITE_NAME}`,
    description,
    openGraph: { title, description, url: `/c/${c.id}`, siteName: SITE_NAME, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default function Layout({ children }: LayoutProps<"/c/[id]">) {
  return children;
}
