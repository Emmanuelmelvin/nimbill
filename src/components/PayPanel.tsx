"use client";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Hex } from "viem";
import { api, type PublicInvoice } from "@/lib/client/api";
import { getNimiq, nimiqPaymentUri, useNimiq, walletErrorMessage } from "@/lib/client/nimiq";
import { polygonWallet } from "@/lib/client/wallet";
import { formatAsset, formatFiat } from "@/lib/currencies";
import { AppError, Errors } from "@/lib/errors";
import {
  Alert,
  AnchorButton,
  Button,
  Card,
  CardHeader,
  CopyButton,
  Countdown,
  Eyebrow,
  Loader,
  OpenInNimiqPay,
  SegmentedControl,
  Spinner,
  TextButton,
} from "./ui";

type Asset = "NIM" | "USDT";
type Quote = { id: string; asset: Asset; amount: string; rate: string; expiresAt: string; recipient: string; memo: string };
type Phase =
  | { k: "choose" }
  | { k: "quoting" }
  | { k: "quoted"; quote: Quote }
  | { k: "expired"; quote: Quote }
  | { k: "wallet"; quote: Quote }
  | { k: "verifying"; quote: Quote; hash: string | null; message: string };

const ASSETS = [
  { value: "NIM", label: "NIM" },
  { value: "USDT", label: "USDT (Polygon)" },
] as const;

export function PayPanel({
  inv,
  onPaid,
  selfPreview,
}: {
  inv: PublicInvoice;
  onPaid: (inv: PublicInvoice) => void;
  selfPreview?: boolean;
}) {
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
          if (AppError.is(e) && e.code === "NOT_FOUND") return;
          // transient network error: keep trying
        }
      }
      setError(
        "We haven't seen the payment yet. If you sent it, it will show up here shortly — refresh this page in a minute. Don't pay twice.",
      );
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
    try {
      const from = await polygonWallet.requestAccount();
      await polygonWallet.switchToPolygon();
      // Pre-flight checks so the user gets a clear message instead of a failed transaction.
      const [usdtBal, polBal] = await Promise.all([polygonWallet.usdtBalance(from), polygonWallet.gasBalance(from)]);
      if (usdtBal < BigInt(quote.amount)) throw Errors.wallet(`Not enough USDT on Polygon. You need ${formatAsset(quote.amount, "USDT")}.`);
      if (polBal === BigInt(0))
        throw Errors.wallet(
          "You need a little POL on Polygon to pay the network fee (a few cents). Add some POL and try again, or pay with NIM.",
        );
      const hash = await polygonWallet.sendUsdt(from, quote.recipient as Hex, BigInt(quote.amount));
      await watch(quote, hash);
    } catch (e) {
      const msg = walletErrorMessage(e);
      setError(msg ?? "Payment cancelled. You can try again whenever you're ready.");
      setPhase(Date.parse(quote.expiresAt) > Date.now() ? { k: "quoted", quote } : { k: "expired", quote });
    }
  }

  const inWallet = state === "ready";

  if (selfPreview) {
    return (
      <Alert kind="warn">
        This is how your client sees the invoice. You can&apos;t pay your own invoice — send the link to your client, or try the sample
        invoice from the home screen.
      </Alert>
    );
  }

  return (
    <Card className="space-y-4" aria-live="polite">
      <CardHeader title="Pay this invoice" />

      {phase.k === "choose" || phase.k === "quoting" ? (
        <>
          {inv.acceptsUsdt && (
            <SegmentedControl kind="radio" label="Pay with" size="md" block options={ASSETS} value={asset} onChange={setAsset} />
          )}
          {state === "checking" ? (
            <Loader compact />
          ) : inWallet || external ? (
            <Button size="lg" block loading={phase.k === "quoting"} onClick={() => getQuote(external ? "NIM" : asset)}>
              Get price in {external ? "NIM" : asset}
            </Button>
          ) : (
            <>
              <OpenInNimiqPay text="Pay in a few taps with the Nimiq Pay wallet." />
              <TextButton className="w-full" onClick={() => setExternal(true)}>
                I use a different Nimiq wallet
              </TextButton>
            </>
          )}
          <p className="text-center text-xs text-muted">
            The price is converted from {inv.currency} at the live rate and locked for 5 minutes.
          </p>
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
            <Button block onClick={() => getQuote(phase.quote.asset)}>
              Price lock expired — refresh price
            </Button>
          ) : external ? (
            <ExternalWallet quote={phase.quote} onSent={() => watch(phase.quote, null)} />
          ) : (
            <Button
              size="lg"
              block
              loading={phase.k === "wallet"}
              loadingText="Confirm in your wallet…"
              onClick={() => (phase.quote.asset === "NIM" ? payNim(phase.quote) : payUsdt(phase.quote))}
            >
              Pay {formatAsset(phase.quote.amount, phase.quote.asset)}
            </Button>
          )}
        </QuoteBox>
      )}

      {phase.k === "verifying" && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Spinner size="lg" />
          <p className="font-semibold">{phase.message}</p>
          <p className="text-sm text-muted">This usually takes a few seconds. You can close this page — the invoice updates on its own.</p>
        </div>
      )}

      {error && <Alert kind={/cancelled/i.test(error) ? "info" : "error"}>{error}</Alert>}
    </Card>
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
      <Card as="div" tone="inverse" padding="sm">
        <p className="font-mono text-[11px] tracking-wider text-paper/70 uppercase">You pay</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{formatAsset(quote.amount, quote.asset)}</p>
        <p className="mt-1 text-sm text-paper/70">
          for {formatFiat(inv.total, inv.currency)} · 1 {quote.asset} ={" "}
          {rate < 0.01 ? rate.toPrecision(3) : rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {inv.currency}
        </p>
        <p className="mt-3 border-t border-paper/20 pt-3 text-sm">
          {expired ? (
            <span className="font-semibold underline underline-offset-4">Price lock expired</span>
          ) : (
            <>
              Price locked for <Countdown until={quote.expiresAt} onExpire={onExpire} />
            </>
          )}
        </p>
      </Card>
      {children}
    </div>
  );
}

/** Pay from any other Nimiq wallet with a payment link / QR that includes the invoice reference. */
function ExternalWallet({ quote, onSent }: { quote: Quote; onSent: () => void }) {
  const uri = nimiqPaymentUri(quote.recipient, quote.amount, quote.memo);
  return (
    <div className="space-y-3">
      <div className="flex justify-center border border-line bg-paper p-4">
        <QRCodeSVG value={uri} size={200} level="M" />
      </div>
      <AnchorButton href={uri} variant="secondary" block>
        Open in my Nimiq wallet
      </AnchorButton>
      <Card as="div" tone="subtle" padding="sm" className="space-y-3 text-sm">
        <p className="text-muted">Or send manually — the message is required so we can match your payment:</p>
        <CopyRow label="To" value={quote.recipient} />
        <CopyRow label="Amount" value={(Number(quote.amount) / 100_000).toString()} suffix="NIM" />
        <CopyRow label="Message" value={quote.memo} />
      </Card>
      <Button block onClick={onSent}>
        I&apos;ve sent the payment
      </Button>
    </div>
  );
}

function CopyRow({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Eyebrow>{label}</Eyebrow>
        <p className="font-mono text-xs break-all">
          {value} {suffix}
        </p>
      </div>
      <CopyButton text={value} size="sm" />
    </div>
  );
}
