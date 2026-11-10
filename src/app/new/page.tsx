"use client";
import { getHostFiat } from "@nimiq/mini-app-sdk";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Header, Notice, OpenInNimiqPay, Spinner } from "@/components/ui";
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
      <h1 className="mb-4 text-2xl font-bold">New invoice</h1>
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
                items: rows.filter((r) => r.description || r.unitPrice).map((r) => ({ ...r, quantity: Number(r.quantity), unitPrice: Number(r.unitPrice) })),
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
        <section className="card space-y-4">
          <div>
            <label className="label" htmlFor="client">
              Bill to
            </label>
            <input id="client" className="input" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or company name" required maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="email">
              Client email <span className="font-normal">(optional, for your records)</span>
            </label>
            <input id="email" type="email" className="input" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
          </div>
          <div className="grid gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-3">
            <div>
              <label className="label" htmlFor="currency">
                Currency
              </label>
              <select id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="due">
                Due date <span className="font-normal">(optional)</span>
              </label>
              <input id="due" type="date" className="input" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Items</h2>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-surface p-3">
              <div className="flex gap-2">
                <input
                  className="input"
                  value={r.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder="e.g. Website design"
                  aria-label={`Item ${i + 1} description`}
                  required
                  maxLength={120}
                />
                {rows.length > 1 && (
                  <button type="button" className="h-12 w-12 shrink-0 rounded-xl text-muted hover:bg-white" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove item ${i + 1}`}>
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[5rem_1fr] gap-2">
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Qty</span>
                  <input className="input" inputMode="decimal" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/[^0-9.]/g, "") })} aria-label={`Item ${i + 1} quantity`} required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">Price ({currency})</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                    placeholder="0.00"
                    aria-label={`Item ${i + 1} price`}
                    required
                  />
                </label>
              </div>
            </div>
          ))}
          <button type="button" className="btn-ghost w-full" onClick={() => setRows((rs) => [...rs, emptyRow()])} disabled={rows.length >= 30}>
            + Add item
          </button>
          <div className="flex items-end justify-between border-t border-line pt-3">
            <span className="text-muted">Total</span>
            <span className="text-right">
              <span className="block text-2xl font-bold">{formatFiat(total, currency)}</span>
              {rates && total > 0 && (
                <span className="block text-xs text-muted">
                  ≈ {Math.ceil(total / rates.NIM).toLocaleString()} NIM today{merchant.evmAddress ? ` · ${(total / rates.USDT).toFixed(2)} USDT` : ""}
                </span>
              )}
            </span>
          </div>
        </section>

        <section className="card">
          <label className="label" htmlFor="note">
            Note to client <span className="font-normal">(optional)</span>
          </label>
          <textarea id="note" className="input min-h-24 py-3" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Thanks for your business!" />
        </section>

        <Notice>Your client pays the exact amount in NIM{merchant.evmAddress ? " or USDT" : ""} at the live rate when they pay. Money goes straight to your wallet.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn-primary w-full text-lg" disabled={busy || total <= 0}>
          {busy ? <Spinner /> : `Create invoice · ${formatFiat(total, currency)}`}
        </button>
      </form>
    </>
  );
}
