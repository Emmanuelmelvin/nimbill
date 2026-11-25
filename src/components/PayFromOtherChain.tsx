"use client";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type PublicInvoice, type PublicPayin } from "@/lib/client/api";
import { AppError } from "@/lib/errors";
import { PAYIN_SOURCES, checkRefundAddress, getPayinSource, type Coin, type PayinSource } from "@/lib/payin/sources";
import type { ChainId } from "@/lib/withdraw/chains";
import { ChainLogo, TokenLogo } from "./withdraw/logos";
import {
  Alert,
  Button,
  Card,
  CopyButton,
  Countdown,
  Dropdown,
  Eyebrow,
  Field,
  Input,
  Spinner,
  TextButton,
  TextLink,
  cx,
  type DropdownOption,
} from "./ui";

// "Pay from another chain": for clients without Nimiq Pay. They send USDT or USDC from any wallet
// or exchange to a one-time address; it reaches the merchant as USDT on Polygon (lib/payin).

const OPEN = new Set<PublicPayin["status"]>(["awaiting_deposit", "incomplete", "swapping"]);
const storageKey = (invoiceId: string) => `nimbill:payin:${invoiceId}`;

/** The payment this browser started for an invoice, so a reload picks it up again. */
export function savedPayinId(invoiceId: string): string | null {
  try {
    return localStorage.getItem(storageKey(invoiceId));
  } catch {
    return null;
  }
}
function remember(invoiceId: string, payinId: string | null) {
  try {
    if (payinId) localStorage.setItem(storageKey(invoiceId), payinId);
    else localStorage.removeItem(storageKey(invoiceId));
  } catch {
    // private window or storage blocked: the payment still works, it just isn't resumed on reload
  }
}

// A native coin's logo is its own chain's logo (ETH is Ethereum's, SOL is Solana's…).
const COIN_CHAIN: Partial<Record<Coin, ChainId>> = {
  ETH: "ethereum",
  SOL: "solana",
  BNB: "bnb",
  TRX: "tron",
  POL: "polygon",
  AVAX: "avalanche",
};
// Coins whose chain NimBill has no logo for: the coin's sign on its brand colour.
const COIN_GLYPH: Partial<Record<Coin, { sign: string; color: string }>> = {
  BTC: { sign: "₿", color: "#F7931A" },
  LTC: { sign: "Ł", color: "#345D9D" },
  DOGE: { sign: "Ð", color: "#C2A633" },
};

/** A coin's logo on its own: USDT, USDC, BTC, ETH, SOL… */
export function CoinLogo({ coin, className }: { coin: Coin; className?: string }) {
  if (coin === "USDT" || coin === "USDC") return <TokenLogo asset={coin} className={className} />;
  const chain = COIN_CHAIN[coin];
  if (chain) return <ChainLogo chain={chain} className={className} />;
  const g = COIN_GLYPH[coin]!;
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cx("shrink-0", className)}>
      <circle cx="12" cy="12" r="11" fill={g.color} />
      <text x="12" y="16.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
        {g.sign}
      </text>
    </svg>
  );
}

/** The coin's logo, with the chain's logo in the corner when it isn't the coin's own (USDT on Tron, ETH on Base). */
export function PayinCoinIcon({ source, size = "md" }: { source: PayinSource; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span aria-hidden className={cx("relative inline-flex shrink-0", lg ? "h-10 w-10" : "h-6 w-6")}>
      <CoinLogo coin={source.asset} className="h-full w-full" />
      {source.badge && (
        <span className={cx("absolute -right-1 -bottom-1 flex rounded-full bg-paper p-px", lg ? "h-5 w-5" : "h-3.5 w-3.5")}>
          <ChainLogo chain={source.badge} className="h-full w-full" />
        </span>
      )}
    </span>
  );
}

const PLACEHOLDER: Record<PayinSource["addressKind"], string> = {
  evm: "0x…",
  tron: "T…",
  solana: "Your Solana address",
  bitcoin: "bc1…, 1… or 3…",
  litecoin: "ltc1…, L… or M…",
  dogecoin: "D…",
};

const OPTIONS: DropdownOption[] = PAYIN_SOURCES.map((s) => ({
  value: s.id,
  label: s.asset,
  detail: s.chain,
  icon: <PayinCoinIcon source={s} />,
}));

export function PayFromOtherChain({
  inv,
  tip,
  payerEmail,
  blocked,
  extras,
  onPaid,
  onBack,
}: {
  inv: PublicInvoice;
  tip: number;
  payerEmail?: string;
  /** The tip or email above is invalid: don't start yet. */
  blocked: boolean;
  /** Tip and receipt email fields, shown before the payment address is made. */
  extras: ReactNode;
  onPaid: (inv: PublicInvoice) => void;
  onBack: () => void;
}) {
  const [sourceId, setSourceId] = useState(PAYIN_SOURCES[0].id);
  const [refundTo, setRefundTo] = useState("");
  const [touched, setTouched] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payin, setPayin] = useState<PublicPayin | null>(null);
  const [resuming, setResuming] = useState(() => !!savedPayinId(inv.id));
  const source = getPayinSource(sourceId)!;
  const check = checkRefundAddress(source, refundTo);

  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      const r = await api<{ payin: PublicPayin; invoice: PublicInvoice | null }>(`/api/invoices/${inv.id}/payin/${id}`);
      if (stopped.current) return null;
      setPayin(r.payin);
      if (r.payin.status === "paid" && r.invoice) {
        remember(inv.id, null);
        onPaid(r.invoice);
      }
      return r.payin;
    },
    [inv.id, onPaid],
  );

  // Pick up a payment started earlier in this browser.
  useEffect(() => {
    const id = savedPayinId(inv.id);
    if (!id) return;
    refresh(id)
      .catch((e) => {
        if (AppError.is(e) && e.code === "NOT_FOUND") remember(inv.id, null);
      })
      .finally(() => setResuming(false));
  }, [inv.id, refresh]);

  // While the payment is open, check on it every few seconds. Each check also moves it forward.
  const open = payin && OPEN.has(payin.status);
  const payinId = payin?.id;
  useEffect(() => {
    if (!open || !payinId) return;
    const t = setInterval(() => {
      refresh(payinId).catch(() => {
        // network hiccup: the next tick tries again
      });
    }, 5000);
    return () => clearInterval(t);
  }, [open, payinId, refresh]);

  async function start() {
    setTouched(true);
    if (!check.ok || blocked) return;
    setError(null);
    setStarting(true);
    try {
      const r = await api<{ payin: PublicPayin }>(`/api/invoices/${inv.id}/payin`, {
        body: { source: sourceId, refundTo: check.address, tip, ...(payerEmail ? { payerEmail } : {}) },
      });
      remember(inv.id, r.payin.id);
      setPayin(r.payin);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function startOver() {
    remember(inv.id, null);
    setPayin(null);
    setError(null);
  }

  if (resuming) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  if (payin) return <Deposit payin={payin} merchantName={inv.merchantName} onStartOver={startOver} />;

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold">Pay from another chain</p>
        <p className="text-sm text-muted">
          Send crypto from any wallet or exchange. {inv.merchantName} receives it as USDT in their Nimiq Pay wallet.
        </p>
      </div>
      <Field label="Pay with" htmlFor="payin-source">
        <Dropdown
          id="payin-source"
          aria-label="Coin and network to pay with"
          options={OPTIONS}
          value={sourceId}
          onChange={(v) => {
            setSourceId(v);
            setTouched(false);
          }}
        />
      </Field>
      {source.kind === "native" && (
        <p className="-mt-2 text-xs text-muted">
          {source.asset}&apos;s price moves, so the amount to send includes a {source.slippageBps / 100}% buffer and you have{" "}
          {source.depositWindowMin} minutes to send. Whatever isn&apos;t needed comes back to you. Paying with USDT or USDC avoids this.
        </p>
      )}
      <Field
        label={`Your ${source.chain} address, for refunds`}
        htmlFor="payin-refund"
        hint={
          touched && !check.ok ? (
            <span className="font-medium text-ink">{check.message}</span>
          ) : (
            "If the payment can't go through, the money goes back here. Use a wallet you control, not an exchange deposit address."
          )
        }
      >
        <Input
          id="payin-refund"
          mono
          autoComplete="off"
          spellCheck={false}
          value={refundTo}
          onChange={(e) => setRefundTo(e.target.value)}
          onBlur={() => refundTo.trim() && setTouched(true)}
          placeholder={PLACEHOLDER[source.addressKind]}
        />
      </Field>
      {extras}
      <Button size="lg" block loading={starting} loadingText="Getting your payment address…" disabled={blocked} onClick={start}>
        Get payment address
      </Button>
      {error && <Alert kind="error">{error}</Alert>}
      <TextButton className="w-full" onClick={onBack}>
        Back to other ways to pay
      </TextButton>
    </div>
  );
}

function Deposit({ payin, merchantName, onStartOver }: { payin: PublicPayin; merchantName: string; onStartOver: () => void }) {
  const [timeUp, setTimeUp] = useState(() => Date.parse(payin.deadline) <= Date.now());
  const waiting = payin.status === "awaiting_deposit" || payin.status === "incomplete";
  const source = getPayinSource(payin.sourceId);
  const coin = `${payin.sendAmount} ${payin.asset}`;

  if (!OPEN.has(payin.status)) {
    return (
      <div className="space-y-3">
        <Alert kind={payin.status === "paid" ? "success" : payin.status === "refunded" || payin.status === "expired" ? "info" : "warn"}>
          {payin.message}
          {payin.status === "refunded" && payin.refundedAmount && (
            <>
              {" "}
              Refunded: {payin.refundedAmount} {payin.asset} to {payin.refundTo}.
            </>
          )}
        </Alert>
        {(payin.status === "failed" || payin.status === "delivered_unmatched") && (
          <p className="text-center font-mono text-xs break-all text-muted">Reference: {payin.reference}</p>
        )}
        {payin.status !== "paid" && (
          <Button block variant="secondary" onClick={onStartOver}>
            Start again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {waiting && (
        <>
          <Card as="div" tone="inverse" padding="sm">
            <p className="font-mono text-[11px] tracking-wider text-paper/70 uppercase">Send exactly</p>
            <p className="mt-1 flex items-center gap-3 text-3xl font-bold tabular-nums">
              {source && <PayinCoinIcon source={source} size="lg" />}
              {coin}
            </p>
            <p className="mt-1 text-sm text-paper/70">
              on {payin.chain} · {merchantName} receives {payin.receiveAmount} USDT
            </p>
            <p className="mt-3 border-t border-paper/20 pt-3 text-sm">
              {timeUp ? (
                <span className="font-semibold">Time to send has run out</span>
              ) : (
                <>
                  Send within <Countdown until={payin.deadline} onExpire={() => setTimeUp(true)} />
                </>
              )}
            </p>
          </Card>

          {timeUp ? (
            <Alert kind="info">
              Don&apos;t send now. If you already sent, keep this page open: the payment either goes through or comes back to your refund
              address.
            </Alert>
          ) : (
            <>
              <div className="flex justify-center border border-line bg-paper p-4">
                <QRCodeSVG value={payin.depositAddress} size={200} level="M" />
              </div>
              <Card as="div" tone="subtle" padding="sm" className="space-y-3 text-sm">
                <CopyRow label={`To (${payin.chain} address)`} value={payin.depositAddress} />
                <CopyRow label="Amount" value={payin.sendAmount} suffix={payin.asset} />
                {payin.depositMemo && <CopyRow label="Memo (required)" value={payin.depositMemo} />}
              </Card>
              <Alert kind="warn" title={`Send ${payin.asset} on ${payin.chain} only`}>
                Money sent on another network is lost. If your exchange takes a withdrawal fee, add it on top so the full {coin} arrives.
                {payin.kind === "native"
                  ? ` The amount includes a buffer because ${payin.asset}'s price moves: whatever the swap doesn't need comes back to your refund address.`
                  : " Anything extra comes back to your refund address."}
              </Alert>
            </>
          )}
        </>
      )}

      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <Spinner size={waiting ? "md" : "lg"} />
        <p className="font-semibold">{payin.message}</p>
        {payin.depositTx && (
          <TextLink href={payin.depositTx.url} external muted>
            See your payment on {payin.chain}
          </TextLink>
        )}
        <p className="text-sm text-muted">You can close this page. The invoice updates on its own once the payment arrives.</p>
      </div>
    </div>
  );
}

function CopyRow({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <Eyebrow>{label}</Eyebrow>
        <p className="font-mono text-xs break-all">{suffix ? `${value} ${suffix}` : value}</p>
      </div>
      <CopyButton text={value} size="sm" />
    </div>
  );
}
