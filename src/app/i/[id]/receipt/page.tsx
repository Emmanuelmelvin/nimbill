"use client";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CoinAmount, DescriptionList, Eyebrow, Header, Loader, TextLink } from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { nimExplorerTx, polygonExplorerTx } from "@/lib/client/nimiq";
import { formatFiat } from "@/lib/currencies";

/** A printable payment receipt with on-chain proof. "Download PDF" uses the browser's print-to-PDF. */
export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ invoice: PublicInvoice }>(`/api/invoices/${id}`)
      .then((r) => setInv(r.invoice))
      .catch((e) => setError(e.message));
  }, [id]);

  if (error || (inv && inv.status !== "paid")) {
    return (
      <>
        <Header back={`/i/${id}`} />
        <Alert kind="error">{error ?? "This invoice has not been paid yet, so there is no receipt."}</Alert>
      </>
    );
  }
  if (!inv) {
    return (
      <>
        <Header back={`/i/${id}`} />
        <Loader />
      </>
    );
  }
  const p = inv.payment!;
  const asset = p.asset as "NIM" | "USDT";
  const explorer = asset === "NIM" ? nimExplorerTx(p.txHash) : polygonExplorerTx(p.txHash);
  const rate = Number(p.rate);
  const tip = Number(p.tip ?? 0);
  const paidFiat = Number(inv.total) + tip; // what the client paid in the invoice currency

  return (
    <>
      <Header back={`/i/${id}`} />
      <Card as="article" className="space-y-5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow>Payment receipt</Eyebrow>
            <h1 className="mt-1 text-2xl font-bold tabular-nums">{formatFiat(paidFiat, inv.currency)}</h1>
            <p className="text-muted">
              Invoice {inv.number}
              {tip > 0 && ` · includes a ${formatFiat(tip, inv.currency)} tip`}
            </p>
          </div>
          <Badge variant="solid">Paid</Badge>
        </div>

        <DescriptionList
          className="border-y border-line py-4"
          rows={[
            { term: "From", detail: <span className="font-medium">{inv.merchantName}</span> },
            { term: "Billed to", detail: <span className="font-medium">{inv.clientName}</span> },
            { term: "Issued", detail: new Date(inv.createdAt).toLocaleDateString() },
            { term: "Paid", detail: new Date(p.paidAt).toLocaleString() },
          ]}
        />

        <table className="w-full">
          <tbody>
            {inv.items.map((it, i) => (
              <tr key={i} className="border-b border-line">
                <td className="py-2 pr-2 break-words">
                  {it.description}
                  {it.quantity !== 1 && <span className="text-muted"> × {it.quantity}</span>}
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">{formatFiat(it.quantity * it.unitPrice, inv.currency)}</td>
              </tr>
            ))}
            <tr>
              <td className="pt-2 font-semibold">Total</td>
              <td className="pt-2 text-right font-bold tabular-nums">{formatFiat(inv.total, inv.currency)}</td>
            </tr>
            {tip > 0 && (
              <>
                <tr>
                  <td className="pt-2">Tip</td>
                  <td className="pt-2 text-right tabular-nums">{formatFiat(tip, inv.currency)}</td>
                </tr>
                <tr>
                  <td className="pt-2 font-semibold">Total paid</td>
                  <td className="pt-2 text-right font-bold tabular-nums">{formatFiat(paidFiat, inv.currency)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        <Card as="div" tone="subtle" padding="sm" className="space-y-3">
          <Eyebrow>Settlement</Eyebrow>
          <DescriptionList
            rows={[
              {
                term: "Amount",
                detail: (
                  <span className="font-medium">
                    <CoinAmount units={p.amount} asset={asset} />
                  </span>
                ),
              },
              {
                term: "Rate used",
                detail: `1 ${asset} = ${rate < 0.01 ? rate.toPrecision(4) : rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${inv.currency}`,
              },
              { term: "Network", detail: asset === "NIM" ? "Nimiq" : "Polygon (USDT)" },
              { term: "Paid to", detail: asset === "NIM" ? inv.merchantAddress : inv.merchantEvmAddress, mono: true },
              { term: "Paid from", detail: p.from, mono: true },
              {
                term: "Transaction",
                mono: true,
                detail: (
                  <TextLink href={explorer} external>
                    {p.txHash}
                  </TextLink>
                ),
              },
            ]}
          />
        </Card>
        <p className="text-xs text-muted">
          This receipt is backed by a public blockchain transaction. Anyone can verify it using the transaction link above. Generated by
          NimBill.
        </p>
      </Card>
      <Button block className="no-print mt-4" onClick={() => window.print()}>
        Download PDF / Print
      </Button>
    </>
  );
}
