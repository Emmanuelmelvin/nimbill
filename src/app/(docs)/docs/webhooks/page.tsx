import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocPage } from "@/components/docs/DocsParts";

// A placeholder: "Pay with NimBill" (webhooks) is being built. Its docs go here when it ships.

export const metadata: Metadata = {
  title: "Webhooks (coming soon)",
  description: "Pay with NimBill webhooks are coming soon.",
  robots: { index: false },
};

export default function Webhooks() {
  return (
    <DocPage title="Webhooks" description="Part of Pay with NimBill.">
      <Callout type="note" title="Coming soon">
        <p>This page will be written when the feature ships.</p>
      </Callout>
      <p className="text-muted">
        Until then, ask an invoice for its status with{" "}
        <Link href="/docs/api/get-invoice" className="underline underline-offset-4">
          GET /api/invoices/&#123;id&#125;
        </Link>
        , or confirm a payment with{" "}
        <Link href="/docs/api/verify-payment" className="underline underline-offset-4">
          POST /api/invoices/&#123;id&#125;/verify
        </Link>
        .
      </p>
    </DocPage>
  );
}
