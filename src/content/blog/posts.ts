import type { ComponentType } from "react";
import HowWeBuiltCheques from "./how-we-built-cheques";
import MoneyInToMoneyOut from "./money-in-to-money-out";
import PayWithNimBill from "./pay-with-nimbill";

// The blog: one TypeScript file per post in this folder, listed here newest first.
// To add a post, write `<slug>.tsx` with a default-exported component for the body and add it below.

export type Post = {
  slug: string;
  title: string;
  /** One or two sentences, for the index, link previews and search engines. */
  description: string;
  /** Publication day, YYYY-MM-DD. */
  date: string;
  author: { name: string; url: string };
  tags: string[];
  Body: ComponentType;
};

const MERCICHIDI = { name: "mercichidi", url: "https://x.com/mercichidi" };

export const POSTS: Post[] = [
  {
    slug: "money-in-to-money-out",
    title: "From money in to money out: how we built non-custodial withdrawals",
    description:
      "Getting paid is half the job; spending it is the other half. Here is how we built one-tap withdrawals that turn the NIM you earn into USDC and USDT on the networks you already use, without NimBill ever holding your money.",
    date: "2026-11-17",
    author: MERCICHIDI,
    tags: ["Product", "Global Payments"],
    Body: MoneyInToMoneyOut,
  },
  {
    slug: "how-we-built-cheques",
    title: "How we built non-custodial cheques on Nimiq",
    description:
      "How do you put real money inside a shareable link or QR code, lock it to a friend's @tag or leave it open to the first person who claims it, and make sure NimBill can never touch the funds? Inside our two-key digital cheque system.",
    date: "2026-11-17",
    author: MERCICHIDI,
    tags: ["Product", "Behind the Scenes"],
    Body: HowWeBuiltCheques,
  },
  {
    slug: "pay-with-nimbill",
    title: "Introducing Pay with NimBill",
    description:
      "Online stores can now create signed invoices on their NimBill board and get a webhook the moment one is paid. No API key: one webhook secret signs both ways.",
    date: "2026-11-14",
    author: MERCICHIDI,
    tags: ["Product", "Developers"],
    Body: PayWithNimBill,
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

/** "14 November 2026". Dates are calendar days, so format them in UTC to keep the day as written. */
export function formatPostDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
