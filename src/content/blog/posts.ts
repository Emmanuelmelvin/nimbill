import type { ComponentType } from "react";
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
