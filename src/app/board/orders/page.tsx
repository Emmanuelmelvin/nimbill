"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BoardPage } from "@/components/BoardPage";
import { Alert, CoinAmount, EmptyState, LinkButton, Loader, SegmentedControl } from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import { formatMoney, type Fx } from "@/lib/money";

type Order = PublicInvoice & { usd: number | null };
type Listing = { orders: Order[]; fx: Fx | null; currency: string };

const VIEWS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Not paid yet" },
] as const;

export default function Orders() {
  return (
    <BoardPage title="Orders" description="Everything paid through your board, each with its receipt.">
      <OrderList />
    </BoardPage>
  );
}

function OrderList() {
  const router = useRouter();
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"paid" | "pending">("paid");
  useEffect(() => {
    api<Listing>("/api/board/orders")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!data) return <Loader compact />;
  if (data.orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description="When someone pays on your board, it shows up here."
        action={
          <LinkButton href="/board" variant="secondary" size="sm">
            Share your link
          </LinkButton>
        }
      />
    );
  }

  const shown = data.orders.filter((o) => (view === "paid" ? o.status === "paid" : o.status === "unpaid"));
  const paidTotal = data.orders.filter((o) => o.status === "paid").reduce((s, o) => s + (o.usd ?? 0), 0);

  return (
    <div className="space-y-4">
      <SegmentedControl label="Show" options={VIEWS} value={view} onChange={setView} block size="md" />
      {view === "paid" && (
        <p className="font-mono text-[11px] tracking-wider text-muted uppercase">
          {formatMoney(paidTotal, data.currency, data.fx, { whole: true })} from {shown.length} {shown.length === 1 ? "order" : "orders"}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{view === "paid" ? "Nothing paid yet." : "No unpaid orders."}</p>
      ) : (
        <div className="overflow-hidden border border-ink">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-ink bg-subtle text-left font-mono text-[10px] tracking-wider text-muted uppercase">
                <th className="w-[30%] px-3 py-2 font-normal">No.</th>
                <th className="px-3 py-2 font-normal">For · from</th>
                <th className="w-[30%] px-3 py-2 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/i/${o.id}`)}
                  className="cursor-pointer border-b border-line transition-colors last:border-b-0 hover:bg-subtle"
                >
                  <td className="px-3 py-3 align-top font-mono text-xs">
                    <a href={`/i/${o.id}`} className="underline-offset-4 hover:underline" onClick={(e) => e.stopPropagation()}>
                      {o.status === "paid" ? o.number : "Unpaid"}
                    </a>
                    <span className="mt-0.5 block text-[10px] text-muted">{new Date(o.createdAt).toLocaleDateString()}</span>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <span className="block truncate font-medium">
                      {(o.items[0]?.quantity ?? 1) > 1 && `${o.items[0].quantity} × `}
                      {o.items[0]?.description}
                    </span>
                    <span className="block truncate text-xs text-muted">{o.clientName}</span>
                  </td>
                  <td className="px-3 py-3 text-right align-top">
                    <span className="block font-mono text-xs font-semibold tabular-nums">{formatFiat(o.total, o.currency)}</span>
                    {o.payment && (
                      <span className="block font-mono text-[10px] text-muted">
                        <CoinAmount units={o.payment.amount} asset={o.payment.asset as "NIM" | "USDT"} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        {view === "paid"
          ? "Paid orders are checked on the blockchain and count as earnings. Tap one for its receipt."
          : "Someone started paying but hasn't finished. These aren't in your invoices or totals, and disappear after 7 days."}
      </p>
    </div>
  );
}
