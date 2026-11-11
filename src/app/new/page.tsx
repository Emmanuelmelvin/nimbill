"use client";
import { getHostFiat } from "@nimiq/mini-app-sdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Field, Header, Input, Label, OpenInNimiqPay, PageTitle, Textarea } from "@/components/ui";
import { CurrencySelect } from "@/components/CurrencySelect";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { CURRENCIES, formatFiat } from "@/lib/currencies";

type Row = { description: string; quantity: string; unitPrice: string };
const emptyRow = (): Row => ({ description: "", quantity: "1", unitPrice: "" });
const LAST_CURRENCY = "nimbill:currency";

export default function NewInvoice() {
  const router = useRouter();
  const { merchant, loading } = useSession();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<{ currency: string; NIM: number; USDT: number } | null>(null);
  const rates = rateFor?.currency === currency ? rateFor : null;

  // Default currency: last one used, else the fiat the user picked in Nimiq Pay.
  // Read after mount (localStorage / host context don't exist during server render).
  useEffect(() => {
    const pick = localStorage.getItem(LAST_CURRENCY) || getHostFiat?.();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from browser-only storage
    if (pick && CURRENCIES.some((c) => c.code === pick)) setCurrency(pick);
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ rates: { NIM: number; USDT: number } }>(`/api/rates?currency=${currency}`)
      .then((r) => alive && setRateFor({ currency, ...r.rates }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [currency]);

  const total = useMemo(
    () => Math.round(rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0) * 100) / 100,
    [rows],
  );

  if (loading) return <Header back="/" />;
  if (!merchant) {
    return (
      <>
        <Header back="/" />
        <OpenInNimiqPay text="Sign in with Nimiq Pay to create invoices." />
      </>
    );
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <>
      <Header back="/" />
      <PageTitle title="New invoice" />
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            localStorage.setItem(LAST_CURRENCY, currency);
            const { invoice } = await api<{ invoice: PublicInvoice }>("/api/invoices", {
              body: {
                clientName,
                clientEmail,
                currency,
                items: rows
                  .filter((r) => r.description || r.unitPrice)
                  .map((r) => ({ ...r, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice) })),
                note,
                dueDate,
              },
            });
            router.replace(`/i/${invoice.id}?created=1`);
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        <Card className="space-y-4">
          <Field label="Bill to" htmlFor="client">
            <Input
              id="client"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client or company name"
              required
              maxLength={80}
            />
          </Field>
          <Field label="Client email" htmlFor="email" optional hint="For your records only. Your client never sees it.">
            <Input
              id="email"
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@example.com"
            />
          </Field>
          <div className="grid gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-3">
            <Field label="Currency" htmlFor="currency">
              <CurrencySelect id="currency" value={currency} onChange={setCurrency} />
            </Field>
            <Field label="Due date" htmlFor="due" optional>
              <Input
                id="due"
                type="date"
                value={dueDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-bold">Items</h2>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 border border-line bg-subtle p-3">
              <div className="flex gap-2">
                <Input
                  value={r.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="e.g. Website design"
                  aria-label={`Item ${i + 1} description`}
                  required
                  maxLength={120}
                />
                {rows.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12"
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    aria-label={`Remove item ${i + 1}`}
                  >
                    ✕
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-[5rem_1fr] gap-2">
                <div>
                  <Label size="sm" htmlFor={`qty-${i}`}>
                    Qty
                  </Label>
                  <Input
                    id={`qty-${i}`}
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value.replace(/[^0-9.]/g, "") })}
                    required
                  />
                </div>
                <div>
                  <Label size="sm" htmlFor={`price-${i}`}>
                    Price ({currency})
                  </Label>
                  <Input
                    id={`price-${i}`}
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                    placeholder="0.00"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
          <Button variant="secondary" block onClick={() => setRows((rs) => [...rs, emptyRow()])} disabled={rows.length >= 30}>
            + Add item
          </Button>
          <div className="flex items-end justify-between border-t border-ink pt-3">
            <span className="font-medium">Total</span>
            <span className="text-right">
              <span className="block text-2xl font-bold tabular-nums">{formatFiat(total, currency)}</span>
              {rates && total > 0 && (
                <span className="block font-mono text-xs text-muted">
                  ≈ {Math.ceil(total / rates.NIM).toLocaleString()} NIM today
                  {merchant.evmAddress ? ` · ${(total / rates.USDT).toFixed(2)} USDT` : ""}
                </span>
              )}
            </span>
          </div>
        </Card>

        <Card>
          <Field label="Note to client" htmlFor="note" optional>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Thanks for your business!"
            />
          </Field>
        </Card>

        <Alert>
          Your client pays the exact amount in NIM{merchant.evmAddress ? " or USDT" : ""} at the live rate when they pay. Money goes
          straight to your wallet.
        </Alert>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" block loading={busy} disabled={total <= 0}>
          Create invoice · {formatFiat(total, currency)}
        </Button>
      </form>
    </>
  );
}
