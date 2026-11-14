import { formatPostDate, getPost } from "@/content/blog/posts";
import { OG_SIZE } from "@/lib/og";
import { pageOgImage } from "@/lib/og-page";

// Each post's share image shows its title.
export const alt = "A post on the NimBill blog";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const post = getPost((await params).slug);
  return pageOgImage({
    label: "NimBill blog",
    title: post?.title ?? "NimBill blog",
    footerLeft: post ? `${formatPostDate(post.date)} · ${post.author.name}` : "News from NimBill",
  });
}
