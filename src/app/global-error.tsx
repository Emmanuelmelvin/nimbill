"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client/log";
import "./globals.css";

// Last-resort boundary: replaces the root layout when it crashes, so it renders its own <html>.
// Plain markup only: the app's components and providers may be what failed.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { boundary: "app/global-error", digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-full bg-paper font-sans text-ink">
        <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
          <h1 className="text-2xl font-bold tracking-tight">NimBill hit a problem</h1>
          <p className="text-sm text-muted">Something went wrong while loading the app. Your invoices and payments are safe.</p>
          {error.digest && <p className="font-mono text-xs text-muted">Reference: {error.digest}</p>}
          <button type="button" onClick={reset} className="min-h-12 w-full border border-ink bg-ink px-5 font-semibold text-paper">
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
