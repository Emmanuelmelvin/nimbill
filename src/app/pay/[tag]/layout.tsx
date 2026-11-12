import type { Metadata } from "next";
import { getPublicBoard } from "@/lib/board-server";
import { SITE_NAME } from "@/lib/site";

export async function generateMetadata({ params }: LayoutProps<"/pay/[tag]">): Promise<Metadata> {
  const { tag } = await params;
  const board = await getPublicBoard(decodeURIComponent(tag)).catch(() => null);
  if (!board) return { title: `Board not found · ${SITE_NAME}` };
  const { merchant } = board;
  const title = `Pay ${merchant.name}`;
  const description = `${merchant.handle}${merchant.bio ? ` · ${merchant.bio}` : ""} · Pay in NIM${merchant.acceptsUsdt ? " or USDT" : ""} with Nimiq Pay.`;
  return {
    title: `${title} · ${SITE_NAME}`,
    description,
    openGraph: { title, description, url: `/pay/${merchant.tag}`, siteName: SITE_NAME, type: "website" },
    // Lets agents that land on the page find the machine-readable board (with its howToPay steps).
    alternates: { types: { "application/json": `/api/pay/${merchant.tag}` } },
    twitter: { card: "summary", title, description },
  };
}

export default function Layout({ children }: LayoutProps<"/pay/[tag]">) {
  return children;
}
