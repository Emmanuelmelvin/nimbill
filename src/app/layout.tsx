import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, baseOpenGraph, siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: SITE_NAME,
  // Each route sets its own title (see the layout.tsx next to each page); this adds " · NimBill".
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  // Share image comes from app/opengraph-image.tsx (invoices have their own in app/i/[id]).
  openGraph: { ...baseOpenGraph, title: SITE_TITLE, description: SITE_DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  // Lets the page see the real safe areas. Android 15 runs apps edge to edge, so a web view can
  // sit under the system gesture bar; without "cover" the browser reports a 0 bottom inset and the
  // tab bar's labels end up under that bar. The tab bar and toasts pad by env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Nimiq Pay injects --safe-area-inset-* styles on <html> before React hydrates; ignore that attribute mismatch.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Top inset: with viewport-fit=cover a full-screen web view could otherwise draw under the status bar. 0 elsewhere. */}
      <body className="min-h-full overflow-x-clip pt-[env(safe-area-inset-top,0px)] font-sans">
        {/* Pages are a narrow column, except pages with full-width sections (.bleed: the landing page,
            the docs), where the column opens up to the whole width and the page sets its own. */}
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 pb-12 has-[.bleed]:max-w-none has-[.bleed]:px-0">
          {children}
        </div>
        <Toaster />
      </body>
    </html>
  );
}
