"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { nimExplorerTx, polygonExplorerTx } from "@/lib/client/nimiq";
import { formatAsset, formatFiat } from "@/lib/currencies";
import type { TransferView } from "@/lib/transfers";
import { Alert, Badge, Card, EmptyState, LinkButton, Loader, cx } from "./ui";

/** Money sent to and received from other NimBill users by tag. Kept apart from invoices and earnings. */
export function TransferList() {
  const [transfers, setTransfers] = useState<TransferView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ transfers: TransferView[] }>("/api/transfers")
      .then((r) => setTransfers(r.transfers))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!transfers) return <Loader compact />;

  return (
    <section className="space-y-3">
      {transfers.length === 0 ? (
        <EmptyState
          title="No transfers yet"
          description="Send money to anyone on NimBill with their tag, like ada@nimbill."
          action={
            <LinkButton href="/send" variant="secondary" size="sm">
              Send money
            </LinkButton>
          }
        />
      ) : (
        <>
          <Card as="div" padding="none">
            <ul className="divide-y divide-line">
              {transfers.map((t) => {
                const sent = t.direction === "sent";
                // Typed in a currency: show that first, with the coin underneath. Typed in the coin: just the coin.
                const fiat = t.currency !== "NIM" && t.currency !== "USDT" ? formatFiat(t.fiatAmount, t.currency) : null;
                const coin = formatAsset(t.amount, t.asset);
                const explorer = t.txHash ? (t.asset === "USDT" ? polygonExplorerTx(t.txHash) : nimExplorerTx(t.txHash)) : null;
                const row = (
                  <>
                    <span
                      aria-hidden
                      className={cx(
                        "flex h-9 w-9 shrink-0 items-center justify-center border border-ink font-mono",
                        !sent && "bg-ink text-paper",
                      )}
                    >
                      {sent ? "↗" : "↙"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        <span className="sr-only">{sent ? "Sent to " : "Received from "}</span>
                        {t.counterparty.handle ?? t.counterparty.name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {t.note ? `${t.note} · ` : ""}
                        {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-bold tabular-nums">
                        {/* Thin space: "−₦" otherwise reads as a struck-through N. */}
                        {sent ? "− " : "+ "}
                        {fiat ?? coin}
                      </p>
                      {t.status === "pending" ? (
                        <Badge variant="muted">Pending</Badge>
                      ) : (
                        fiat && <p className="font-mono text-xs text-muted">{coin}</p>
                      )}
                    </div>
                  </>
                );
                return (
                  <li key={t.id}>
                    {explorer ? (
                      <a
                        href={explorer}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-4 transition-colors hover:bg-subtle"
                      >
                        {row}
                      </a>
                    ) : (
                      <div className="flex items-center gap-3 p-4">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <LinkButton href="/send" variant="secondary" block>
            Send money
          </LinkButton>
        </>
      )}
      <p className="text-xs text-muted">
        Transfers are kept apart from your earnings. Each one links to its transaction on the blockchain. Pending transfers that never reach
        the blockchain disappear after a day.
      </p>
    </section>
  );
}
