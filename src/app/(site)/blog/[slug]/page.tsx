import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@/components/site/SiteShell";
import { LinkButton } from "@/components/ui";
import { POSTS, formatPostDate, getPost } from "@/content/blog/posts";
import { pageMetadata } from "@/lib/site";

// Posts are files in src/content/blog, so every page is built ahead of time and unknown slugs 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = getPost((await params).slug);
  if (!post) return {};
  const meta = pageMetadata({ title: post.title, description: post.description, path: `/blog/${post.slug}`, type: "article" });
  return {
    ...meta,
    authors: [{ name: post.author.name, url: post.author.url }],
    openGraph: { ...meta.openGraph, publishedTime: post.date, authors: [post.author.url], tags: post.tags },
  };
}

export default async function BlogPost({ params }: PageProps<"/blog/[slug]">) {
  const post = getPost((await params).slug);
  if (!post) notFound();
  const { Body } = post;
  return (
    <article>
      <header className="border-b border-line">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
          <Link href="/blog" className="font-mono text-[11px] tracking-wider text-muted uppercase hover:text-ink">
            ← Blog
          </Link>
          <h1 className="mt-4 text-4xl leading-[1.02] font-bold tracking-tighter text-balance sm:text-6xl">{post.title}</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">{post.description}</p>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span aria-hidden>·</span>
            <span>
              By{" "}
              <a href={post.author.url} target="_blank" rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
                {post.author.name}
              </a>
            </span>
          </p>
        </div>
      </header>

      <Prose>
        <Body />
      </Prose>

      <div className="mx-auto mt-14 w-full max-w-3xl px-4 sm:px-6">
        <div className="flex flex-col gap-4 border border-ink p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-semibold">Ready to try it?</p>
            <p className="mt-1 text-sm text-muted">Open NimBill in Nimiq Pay, or read the developer docs.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <LinkButton href="/" size="sm">
              Open NimBill
            </LinkButton>
            <LinkButton href="/docs/webhooks" variant="secondary" size="sm">
              Read the docs
            </LinkButton>
          </div>
        </div>
      </div>
    </article>
  );
}
