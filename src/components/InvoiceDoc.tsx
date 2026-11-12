import type { PublicInvoice } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import { shortAddress } from "@/lib/nimiq-address";
import { Card, Eyebrow, StatusBadge } from "./ui";

/** The invoice itself, as both parties see it. */
export function InvoiceDoc({ inv }: { inv: PublicInvoice }) {
  const tip = Number(inv.payment?.tip ?? 0);
  return (
    <Card as="article" className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>
            {/* An unpaid board invoice has no number of its own yet: its number is the Nimbill number. */}
            Invoice {inv.number === inv.nimbillNumber ? inv.number : `${inv.number} · ${inv.nimbillNumber}`}
          </Eyebrow>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatFiat(inv.total, inv.currency)}</p>
          {inv.dueDate && inv.status === "unpaid" && (
            <p className="mt-1 text-sm text-muted">Due {new Date(inv.dueDate + "T00:00:00").toLocaleDateString()}</p>
          )}
        </div>
        <StatusBadge status={inv.status} dueDate={inv.dueDate} />
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
        <div>
          <Eyebrow>From</Eyebrow>
          <p className="mt-1 font-semibold break-words">{inv.merchantName}</p>
          <p className="font-mono text-xs text-muted">{shortAddress(inv.merchantAddress)}</p>
        </div>
        <div>
          <Eyebrow>Bill to</Eyebrow>
          <p className="mt-1 font-semibold break-words">{inv.clientName}</p>
          <p className="text-xs text-muted">{new Date(inv.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink text-left">
            <th className="pb-2 font-mono text-[11px] font-medium tracking-wider text-muted uppercase">Item</th>
            <th className="pb-2 text-right font-mono text-[11px] font-medium tracking-wider text-muted uppercase">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2.5 pr-2">
                <p className="break-words">{it.description}</p>
                {it.quantity !== 1 && (
                  <p className="text-xs text-muted">
                    {it.quantity} × {formatFiat(it.unitPrice, inv.currency)}
                  </p>
                )}
              </td>
              <td className="py-2.5 text-right whitespace-nowrap tabular-nums">{formatFiat(it.quantity * it.unitPrice, inv.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 font-semibold">Total</td>
            <td className="pt-3 text-right font-bold tabular-nums">{formatFiat(inv.total, inv.currency)}</td>
          </tr>
          {tip > 0 && (
            <>
              <tr>
                <td className="pt-2">Tip</td>
                <td className="pt-2 text-right tabular-nums">{formatFiat(tip, inv.currency)}</td>
              </tr>
              <tr>
                <td className="pt-2 font-semibold">Total paid</td>
                <td className="pt-2 text-right font-bold tabular-nums">{formatFiat(Number(inv.total) + tip, inv.currency)}</td>
              </tr>
            </>
          )}
        </tfoot>
      </table>

      {inv.note && <p className="border-l-2 border-ink bg-subtle p-3 text-sm whitespace-pre-line">{inv.note}</p>}
    </Card>
  );
}
