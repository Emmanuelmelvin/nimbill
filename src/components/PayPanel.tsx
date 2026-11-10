"use client";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { api, ApiError, type PublicInvoice } from "@/lib/client/api";
import { getNimiq, nimiqPaymentUri, useNimiq, walletErrorMessage } from "@/lib/client/nimiq";
import { formatAsset, formatFiat } from "@/lib/currencies";
import { CopyButton, Countdown, Notice, OpenInNimiqPay, Spinner } from "./ui";

type Asset = "NIM" | "USDT";
type Quote = { id: string; asset: Asset; amount: string; rate: string; expiresAt: string; recipient: string; memo: string };
type Phase =
  | { k: "choose" }
  | { k: "quoting" }
  | { k: "quoted"; quote: Quote }
  | { k: "expired"; quote: Quote }
  | { k: "wallet"; quote: Quote }
  | { k: "verifying"; quote: Quote; hash: string | null; message: string };

const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

export function PayPanel({ inv, onPaid, selfPreview }: { inv: PublicInvoice; onPaid: (inv: PublicInvoice) => void; selfPreview?: boolean }) {
  const { state } = useNimiq();
  const [asset, setAsset] = useState<Asset>("NIM");
  const [phase, setPhase] = useState<Phase>({ k: "choose" });
  const [error, setError] = useState<string | null>(null);
  const [external, setExternal] = useState(false);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const getQuote = useCallback(
    async (a: Asset) => {
      setError(null);
      setPhase({ k: "quoting" });
      try {
        const { quote } = await api<{ quote: Quote }>(`/api/invoices/${inv.id}/quote`, { body: { asset: a } });
        setPhase({ k: "quoted", quote });
      } catch (e) {
        setError((e as Error).message);
        setPhase({ k: "choose" });
      }
    },
    [inv.id],
  );

  /** Poll the server until the payment is verified on-chain (≈3 min max). */
  const watch = useCallback(
    async (quote: Quote, hash: string | null) => {
      setPhase({ k: "verifying", quote, hash, message: "Confirming your payment on the blockchain…" });
      for (let i = 0; i < 60 && !stopped.current; i++) {
        await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000));
        try {
          if (hash) {
            const r = await api<{ status: string; message?: string; invoice?: PublicInvoice }>(`/api/invoices/${inv.id}/verify`, {
              body: { asset: quote.asset, txHash: hash },
            });
            if (r.status === "paid" && r.invoice) return onPaid(r.invoice);
            if (r.status === "rejected") {
              setError(r.message ?? "This payment could not be matched to the invoice.");
              return setPhase({ k: "choose" });
            }
            if (r.message) setPhase({ k: "verifying", quote, hash, message: r.message });
          } else {
            const r = await api<{ invoice: PublicInvoice }>(`/api/invoices/${inv.id}`);
            if (r.invoice.status === "paid") return onPaid(r.invoice);
          }
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) return;
          // transient network error: keep trying
        }
      }
      setError("We haven't seen the payment yet. If you sent it, it will show up here shortly — refresh this page in a minute. Don't pay twice.");
      setPhase({ k: "choose" });
    },
    [inv.id, onPaid],
  );

  async function payNim(quote: Quote) {
    setError(null);
    setPhase({ k: "wallet", quote });
    try {
      const nimiq = await getNimiq();
      const hash = await nimiq.sendBasicTransactionWithData({ recipient: quote.recipient, value: Number(quote.amount), data: quote.memo });
      await watch(quote, hash);
    } catch (e) {
      const err = e as { type?: string };
      if (err?.type === "TRANSACTION_OUTCOME_UNKNOWN") return watch(quote, null);
      const msg = walletErrorMessage(e);
      setError(msg ?? "Payment cancelled. You can try again whenever you're ready.");
      setPhase(Date.parse(quote.expiresAt) > Date.now() ? { k: "quoted", quote } : { k: "expired", quote });
    }
  }

  async function payUsdt(quote: Quote) {
    setError(null);
    setPhase({ k: "wallet", quote });
    const eth = (window as unknown as { ethereum?: Eth }).ethereum;
    try {
      if (!eth) throw new Error("USDT payments need Nimiq Pay. Open this invoice in Nimiq Pay.");
      const [from] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x89" }] });
      } catch (e) {
        if ((e as { code?: number }).code === 4902) throw new Error("Polygon is not set up in your wallet. Update Nimiq Pay and try again.");
        throw e;
      }
      // Pre-flight checks so the user gets a clear message instead of a failed transaction.
      const balanceData = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [from as Hex] });
      const [usdtBal, polBal] = await Promise.all([
        eth.request({ method: "eth_call", params: [{ to: USDT_POLYGON, data: balanceData }, "latest"] }) as Promise<Hex>,
        eth.request({ method: "eth_getBalance", params: [from, "latest"] }) as Promise<Hex>,
      ]);
      if (BigInt(usdtBal || "0x0") < BigInt(quote.amount)) throw new Error(`Not enough USDT on Polygon. You need ${formatAsset(quote.amount, "USDT")}.`);
      if (BigInt(polBal || "0x0") === BigInt(0)) throw new Error("You need a little POL on Polygon to pay the network fee (a few cents). Add some POL and try again, or pay with NIM.");
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [quote.recipient as Hex, BigInt(quote.amount)] });
      const hash = (await eth.request({ method: "eth_sendTransaction", params: [{ from, to: USDT_POLYGON, data, value: "0x0" }] })) as string;
      await watch(quote, hash);
    } catch (e) {
      const msg = walletErrorMessage(e);
      setError(msg ?? "Payment cancelled. You can try again whenever you're ready.");
      setPhase(Date.parse(quote.expiresAt) > Date.now() ? { k: "quoted", quote } : { k: "expired", quote });
    }
  }

  const inWallet = state === "ready";

  if (selfPreview) {
    return <Notice kind="warn">This is how your client sees the invoice. You can&apos;t pay your own invoice — send the link to your client, or try the sample invoice from the home screen.</Notice>;
  }

  return (
    <section className="card space-y-4" aria-live="polite">
      <h2 className="text-lg font-bold">Pay this invoice</h2>

      {phase.k === "choose" || phase.k === "quoting" ? (
        <>
          {inv.acceptsUsdt && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Pay with">
              {(["NIM", "USDT"] as const).map((a) => (
                <button
                  key={a}
                  role="radio"
                  aria-checked={asset === a}
                  onClick={() => setAsset(a)}
                  className={`min-h-11 rounded-lg font-semibold ${asset === a ? "bg-white text-navy shadow-sm" : "text-muted"}`}
                >
                  {a === "NIM" ? "NIM" : "USDT (Polygon)"}
                </button>
              ))}
            </div>
          )}
          {state === "checking" ? (
            <div className="flex justify-center py-3 text-navy">
              <Spinner />
            </div>
          ) : inWallet || external ? (
            <button className="btn-primary w-full text-lg" disabled={phase.k === "quoting"} onClick={() => getQuote(external ? "NIM" : asset)}>
              {phase.k === "quoting" ? <Spinner /> : `Get price in ${external ? "NIM" : asset}`}
            </button>
          ) : (
            <>
              <OpenInNimiqPay text="Pay in a few taps with the Nimiq Pay wallet." />
              <button className="w-full py-2 text-sm text-muted underline" onClick={() => setExternal(true)}>
                I use a different Nimiq wallet
              </button>
            </>
          )}
          <p className="text-center text-xs text-muted">The price is converted from {inv.currency} at the live rate and locked for 5 minutes.</p>
        </>
      ) : null}

      {(phase.k === "quoted" || phase.k === "expired" || phase.k === "wallet") && (
        <QuoteBox
          inv={inv}
          quote={phase.quote}
          expired={phase.k === "expired"}
          onExpire={() => setPhase((p) => (p.k === "quoted" ? { k: "expired", quote: p.quote } : p))}
        >
          {phase.k === "expired" ? (
            <button className="btn-dark w-full" onClick={() => getQuote(phase.quote.asset)}>
              Price lock expired — refresh price
            </button>
          ) : external ? (
            <ExternalWallet quote={phase.quote} onSent={() => watch(phase.quote, null)} />
          ) : (
            <button
              className="btn-primary w-full text-lg"
              disabled={phase.k === "wallet"}
              onClick={() => (phase.quote.asset === "NIM" ? payNim(phase.quote) : payUsdt(phase.quote))}
            >
              {phase.k === "wallet" ? (
                <>
                  <Spinner /> Confirm in your wallet…
                </>
              ) : (
                `Pay ${formatAsset(phase.quote.amount, phase.quote.asset)}`
              )}
            </button>
          )}
        </QuoteBox>
      )}

      {phase.k === "verifying" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner className="h-8 w-8 text-gold-dark" />
          <p className="font-semibold">{phase.message}</p>
          <p className="text-sm text-muted">This usually takes a few seconds. You can close this page — the invoice updates on its own.</p>
        </div>
      )}

      {error && <Notice kind={/cancelled/i.test(error) ? "info" : "error"}>{error}</Notice>}
    </section>
  );
}

function QuoteBox({
  inv,
  quote,
  expired,
  onExpire,
  children,
}: {
  inv: PublicInvoice;
  quote: Quote;
  expired: boolean;
  onExpire: () => void;
  children: React.ReactNode;
}) {
  const rate = Number(quote.rate);
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-navy p-4 text-white">
        <p className="text-sm text-white/70">You pay</p>
        <p className="text-3xl font-bold">{formatAsset(quote.amount, quote.asset)}</p>
        <p className="mt-1 text-sm text-white/70">
          for {formatFiat(inv.total, inv.currency)} · 1 {quote.asset} = {rate < 0.01 ? rate.toPrecision(3) : rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {inv.currency}
        </p>
        <p className="mt-2 text-sm">{expired ? <span className="text-gold">Price lock expired</span> : <>Price locked for <Countdown until={quote.expiresAt} onExpire={onExpire} /></>}</p>
      </div>
      {children}
    </div>
  );
}

/** Pay from any other Nimiq wallet with a payment link / QR that includes the invoice reference. */
function ExternalWallet({ quote, onSent }: { quote: Quote; onSent: () => void }) {
  const uri = nimiqPaymentUri(quote.recipient, quote.amount, quote.memo);
  return (
    <div className="space-y-3">
      <div className="flex justify-center rounded-xl bg-white p-3">
        <QRCodeSVG value={uri} size={200} level="M" />
      </div>
      <a href={uri} className="btn-dark w-full">
        Open in my Nimiq wallet
      </a>
      <div className="space-y-2 rounded-xl bg-surface p-3 text-sm">
        <p className="text-muted">Or send manually — the message is required so we can match your payment:</p>
        <Field label="To" value={quote.recipient} />
        <Field label="Amount" value={(Number(quote.amount) / 100_000).toString()} suffix="NIM" />
        <Field label="Message" value={quote.memo} />
      </div>
      <button className="btn-primary w-full" onClick={onSent}>
        I&apos;ve sent the payment
      </button>
    </div>
  );
}

function Field({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="font-mono text-xs break-all">
          {value} {suffix}
        </p>
      </div>
      <CopyButton text={value} className="btn-ghost min-h-9 shrink-0 px-3 text-xs" />
    </div>
  );
}
