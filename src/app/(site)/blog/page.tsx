import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/site/SiteShell";
import { POSTS, formatPostDate } from "@/content/blog/posts";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Blog",
  ogTitle: "The NimBill blog",
  description: "News from NimBill: new features, guides and notes on invoices paid in NIM and USDT.",
  path: "/blog",
});

export default function BlogIndex() {
  return (
    <>
      <PageHero eyebrow="Blog" title="News from NimBill" lead="New features, guides and notes on getting paid wallet to wallet." />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 sm:pt-10">
        <ul className="border-t border-ink">
          {POSTS.map((p) => (
            <li key={p.slug} className="border-b border-line">
              <Link href={`/blog/${p.slug}`} className="group block py-8">
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tracking-wider text-muted uppercase">
                  <time dateTime={p.date}>{formatPostDate(p.date)}</time>
                  {p.tags.map((t) => (
                    <span key={t} className="border border-line px-1.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </p>
                <h2 className="mt-3 text-2xl leading-tight font-bold tracking-tight group-hover:underline group-hover:underline-offset-4 sm:text-3xl">
                  {p.title}
                </h2>
                <p className="mt-3 text-muted">{p.description}</p>
                <p className="mt-4 text-sm font-semibold">
                  Read the post{" "}
                  <span aria-hidden className="inline-block transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
