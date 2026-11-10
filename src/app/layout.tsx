import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  // Each route sets its own title (see the layout.tsx next to each page); this adds " · NimBill".
  title: { default: "NimBill — invoices paid in NIM & USDT", template: "%s · NimBill" },
  description: "Invoice clients in your local currency. Get paid in NIM or USDT, straight to your Nimiq Pay wallet, verified on-chain.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 pb-12">{children}</div>
      </body>
    </html>
  );
}
