import { SiteShell } from "@/components/site/SiteShell";

// The public marketing pages (/about, /blog, /privacy, /terms) share one frame: header, content
// and the site footer. The route group keeps the URLs as they are.
export default function Layout({ children }: LayoutProps<"/">) {
  return <SiteShell>{children}</SiteShell>;
}
