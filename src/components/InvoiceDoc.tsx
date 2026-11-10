import type { PublicInvoice } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import { shortAddress } from "@/lib/nimiq-address";
import { StatusBadge } from "./ui";

/** The invoice itself, as both parties see it. */
export function InvoiceDoc({ inv }: { inv: PublicInvoice }) {
  return (
    <article className="card space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Invoice {inv.number}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{formatFiat(inv.total, inv.currency)}</p>
          {inv.dueDate && inv.status === "unpaid" && <p className="mt-1 text-sm text-muted">Due {new Date(inv.dueDate + "T00:00:00").toLocaleDateString()}</p>}
        </div>
        <StatusBadge status={inv.status} dueDate={inv.dueDate} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted">From</p>
          <p className="font-semibold break-words">{inv.merchantName}</p>
          <p className="font-mono text-xs text-muted">{shortAddress(inv.merchantAddress)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Bill to</p>
          <p className="font-semibold break-words">{inv.clientName}</p>
          <p className="text-xs text-muted">{new Date(inv.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={i} className="border-b border-line/60 align-top">
              <td className="py-2.5 pr-2">
                <p className="break-words">{it.description}</p>
                {it.quantity !== 1 && (
                  <p className="text-xs text-muted">
                    {it.quantity} × {formatFiat(it.unitPrice, inv.currency)}
                  </p>
                )}
              </td>
              <td className="py-2.5 text-right whitespace-nowrap">{formatFiat(it.quantity * it.unitPrice, inv.currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="pt-3 font-semibold">Total</td>
            <td className="pt-3 text-right font-bold">{formatFiat(inv.total, inv.currency)}</td>
          </tr>
        </tfoot>
      </table>

      {inv.note && <p className="rounded-xl bg-surface p-3 text-sm whitespace-pre-line text-muted">{inv.note}</p>}
    </article>
  );
}
