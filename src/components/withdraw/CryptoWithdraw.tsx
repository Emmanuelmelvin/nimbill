"use client";
import { getHostFiat } from "@nimiq/mini-app-sdk";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { NimiqProviderError } from "@nimiq/mini-app-sdk";
import {
  Alert,
  AnchorButton,
  Badge,
  Button,
  Card,
  Countdown,
  cx,
  DescriptionList,
  Dropdown,
  Field,
  Input,
  Spinner,
  TextButton,
} from "@/components/ui";
import { api } from "@/lib/client/api";
import { getNimiq, inNimiqPay, walletErrorMessage } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { polygonWallet } from "@/lib/client/wallet";
import { CURRENCY_CODES, formatAsset, formatFiat } from "@/lib/currencies";
import { AppError, Errors } from "@/lib/errors";
import { checkDestination } from "@/lib/withdraw/address";
import { CHAINS, getChain, offerNimiqPayAddress, tokensFor, type Asset, type ChainId, type PayWith } from "@/lib/withdraw/chains";
import { RECEIVE_LIMITS, type QuoteView } from "@/lib/withdraw/schemas";
import { APPROVE_MARGIN_MS, isFinal, type WithdrawalView } from "@/lib/withdraw/types";
import { ChainLogo, TokenLogo } from "./logos";

type Step = "send" | "chain" | "destination" | "amount" | "review" | "tracking" | "receipt";
const FORM_STEPS: Step[] = ["send", "chain", "destination", "amount", "review"];
const STAGES = [
  { label: "Paying", doing: "Nimiq Pay is paying", done: "Nimiq Pay sent it" },
  { label: "Swapping", doing: "Turning it into", done: "Swapped" },
  { label: "Delivering", doing: "Sending it to", done: "Delivered" },
] as const;

/** USDC / USDT in 6-decimal units → "10.00". Tiny fees keep their decimals ("0.004"). */
function stable(units: string | number): string {
  const n = Number(units) / 1_000_000;
  const digits = n > 0 && n < 0.01 ? 6 : 2;
  return new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: digits }).format(n);
}
const shortHex = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An estimate, so no false precision: whole NIM, or USDT to the cent, rounded up. */
function about(units: string, asset: PayWith): string {
  const step = asset === "NIM" ? 100_000 : 10_000;
  return `about ${formatAsset(Math.ceil(Number(units) / step) * step, asset)}`;
}

/** The user's own currency in Nimiq Pay (for "≈ ₦15,800"), when NimBill supports it. */
function useLocalRate() {
  const [local, setLocal] = useState<{ currency: string; perUsdt: number } | null>(null);
  useEffect(() => {
    const fiat = getHostFiat?.();
    const currency = typeof fiat === "string" ? fiat.toUpperCase() : null;
    if (!currency || currency === "USD" || !(CURRENCY_CODES as readonly string[]).includes(currency)) return;
    api<{ rates: { USDT: number } }>(`/api/rates?currency=${currency}`)
      .then((r) => setLocal({ currency, perUsdt: r.rates.USDT }))
      .catch(() => {});
  }, []);
  return local;
}

export function CryptoWithdraw() {
  const { merchant } = useSession();
  const local = useLocalRate();
  const [step, setStep] = useState<Step>("send");
  const [payWith, setPayWith] = useState<PayWith>("NIM");
  const [chainId, setChainId] = useState<ChainId | null>(null);
  const [choosingChain, setChoosingChain] = useState(false); // the list is open again after "Change"
  const [asset, setAsset] = useState<Asset>("USDC");
  const [destination, setDestination] = useState("");
  const [destinationError, setDestinationError] = useState<string | null>(null);
  const [usingMine, setUsingMine] = useState(false);
  const [receive, setReceive] = useState("");
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [withdrawal, setWithdrawal] = useState<WithdrawalView | null>(null); // a real one, once approved
  const [recent, setRecent] = useState<WithdrawalView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nimBalance, setNimBalance] = useState<number | null>(null);

  const chain = chainId ? getChain(chainId) : undefined;
  const tokens = chain ? tokensFor(chain, payWith) : [];

  const loadRecent = useCallback(() => {
    if (!merchant?.address) return;
    api<{ withdrawals: WithdrawalView[] }>("/api/withdraw")
      .then((r) => setRecent(r.withdrawals))
      .catch(() => {});
  }, [merchant?.address]);

  // NIM balance and recent withdrawals, shown on Step 1. Read by the server from the Nimiq network:
  // Nimiq Pay's getBalance() can answer 0 before its light client has synced. Hidden if it fails.
  useEffect(() => {
    if (!merchant?.address) return;
    let alive = true;
    api<{ nim: number }>("/api/withdraw/balance")
      .then((r) => alive && setNimBalance(r.nim))
      .catch(() => {});
    api<{ withdrawals: WithdrawalView[] }>("/api/withdraw")
      .then((r) => alive && setRecent(r.withdrawals))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [merchant?.address]);

  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };

  const pickChain = (id: ChainId) => {
    setChainId(id);
    setChoosingChain(false);
    const c = getChain(id)!;
    const offered = tokensFor(c, payWith).map((t) => t.asset);
    if (!offered.includes(asset)) setAsset(offered[0]);
    // The address belongs to one chain: a new chain needs it checked again.
    setDestinationError(null);
    setUsingMine(false);
  };

  const pickPayWith = (p: PayWith) => {
    setPayWith(p);
    if (chain) {
      const offered = tokensFor(chain, p).map((t) => t.asset);
      if (!offered.includes(asset)) setAsset(offered[0]);
    }
  };

  const useMyAddress = async () => {
    setError(null);
    try {
      setDestination(await polygonWallet.requestAccount());
      setUsingMine(true);
      setDestinationError(null);
    } catch (e) {
      const m = walletErrorMessage(e);
      if (m) setError(m);
    }
  };

  const confirmDestination = () => {
    if (!chain) return go("chain");
    const check = checkDestination(chain, destination);
    if (!check.ok) return setDestinationError(check.message);
    setDestination(check.address);
    go("amount");
  };

  const amountProblem = (() => {
    if (!receive.trim()) return null;
    if (!/^\d+(\.\d{1,6})?$/.test(receive.trim())) return "Enter an amount like 10 or 10.50.";
    const n = Number(receive);
    if (n < RECEIVE_LIMITS.min) return `The smallest withdrawal is ${RECEIVE_LIMITS.min} ${asset}.`;
    if (n > RECEIVE_LIMITS.max) return `The largest withdrawal is ${RECEIVE_LIMITS.max} ${asset} for now.`;
    return null;
  })();

  const getQuote = useCallback(async () => {
    if (!chainId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ quote: QuoteView }>("/api/withdraw/quote", {
        method: "POST",
        body: { payWith, chain: chainId, asset, receive: receive.trim(), destination },
      });
      setQuote(r.quote);
      setStep("review");
    } catch (e) {
      // No live quote means no quote shown: never a guess.
      setQuote(null);
      setError(AppError.is(e) ? e.publicMessage : "Couldn't get a quote. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }, [payWith, chainId, asset, receive, destination]);

  // Approve: create the swap, then pay its Lightning invoice in Nimiq Pay. From here on the
  // server and the worker take over; the progress screen just asks how it is going.
  const approve = async () => {
    if (!quote || !chainId) return;
    if (quote.sample) return go("tracking");
    setError(null);
    if (!inNimiqPay()) return setError("Approving needs Nimiq Pay. Open NimBill in Nimiq Pay to finish this withdrawal.");
    setBusy(true);
    let created: WithdrawalView | null = null;
    try {
      const nimiq = await getNimiq();
      if (typeof nimiq.payLightningInvoice !== "function") {
        throw Errors.wallet("Your Nimiq Pay can't pay Lightning invoices yet. Please update Nimiq Pay.");
      }
      created = (
        await api<{ withdrawal: WithdrawalView }>("/api/withdraw", {
          method: "POST",
          body: {
            payWith,
            chain: chainId,
            asset,
            receive: receive.trim(),
            destination,
            expectedSendEstimate: quote.sendEstimate,
          },
        })
      ).withdrawal;
      if (!created.lightningInvoice) throw Errors.internal(null, "The withdrawal came back without an invoice.");
      const result: unknown = await nimiq.payLightningInvoice({ invoice: created.lightningInvoice });
      const legacy = NimiqProviderError.fromLegacyResponse(result);
      if (legacy) throw legacy;
      const paid = result as { hash?: string; swapId?: string };
      const r = await api<{ withdrawal: WithdrawalView }>(`/api/withdraw/${created.id}/paid`, {
        method: "POST",
        body: { hash: paid.hash, swapId: paid.swapId },
      }).catch(() => null);
      setWithdrawal(r?.withdrawal ?? { ...created, status: "paying", lightningInvoice: null });
      go("tracking");
    } catch (e) {
      // Nimiq Pay may have paid without being able to tell us: follow it rather than cancel it.
      if (created && NimiqProviderError.is(e) && e.type === "TRANSACTION_OUTCOME_UNKNOWN") {
        setWithdrawal({ ...created, status: "paying", lightningInvoice: null });
        return go("tracking");
      }
      const message = walletErrorMessage(e); // null: the user declined
      // The price moved before any swap was paid: show the fresh quote, so the next Approve isn't
      // refused again against the old one.
      if (!created && AppError.is(e) && e.code === "CONFLICT") {
        await getQuote();
        return setError(message);
      }
      if (created) {
        const cancelled = await api<{ withdrawal: WithdrawalView }>(`/api/withdraw/${created.id}/cancel`, {
          method: "POST",
          body: { reason: message ?? "Cancelled in Nimiq Pay. Nothing was spent." },
        }).catch(() => null);
        // If the provider already saw the Lightning payment before Nimiq Pay threw, `markCancelled`
        // rescues the swap and advances it — take the user to the tracking screen instead of an error.
        if (cancelled?.withdrawal && cancelled.withdrawal.status !== "cancelled") {
          setWithdrawal(cancelled.withdrawal);
          return go("tracking");
        }
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const openExisting = (w: WithdrawalView) => {
    setError(null);
    setPayWith(w.payWith);
    setChainId(w.chain as ChainId);
    setAsset(w.asset);
    setDestination(w.destination);
    setWithdrawal(w);
    setQuote({
      sample: false,
      providerName: w.providerName,
      payWith: w.payWith,
      chain: w.chain as ChainId,
      asset: w.asset,
      destination: w.destination,
      receiveAmount: w.receiveAmount,
      receiveMin: w.receiveAmount,
      sendEstimate: w.sendEstimate ?? "0",
      fees: w.fees,
      expiresAt: w.expiresAt ?? new Date().toISOString(),
      etaSeconds: 120,
    });
    setStep(w.status === "delivered" ? "receipt" : "tracking");
  };

  const reset = () => {
    setStep("send");
    setChainId(null);
    setChoosingChain(false);
    setDestination("");
    setUsingMine(false);
    setReceive("");
    setQuote(null);
    setWithdrawal(null);
    setError(null);
    loadRecent();
  };

  const formIndex = FORM_STEPS.indexOf(step);
  const back: Partial<Record<Step, Step>> = { chain: "send", destination: "chain", amount: "destination", review: "amount" };

  return (
    <div className="space-y-4">
      {formIndex >= 0 && (
        <div className="flex min-h-9 items-center justify-between text-sm text-muted">
          {back[step] ? <TextButton onClick={() => go(back[step]!)}>← Back</TextButton> : <span />}
          <span>
            Step {formIndex + 1} of {FORM_STEPS.length}
          </span>
        </div>
      )}
      {/* A withdrawal opened from the list (or one just sent) always has a way back to Step 1 and the
          list. Leaving never stops it: the server keeps it moving, and it can be reopened. */}
      {(step === "tracking" || step === "receipt") && (
        <div className="flex min-h-9 items-center text-sm text-muted">
          <TextButton onClick={reset} disabled={busy}>
            ← Back to withdrawals
          </TextButton>
        </div>
      )}

      {step === "send" && (
        <>
          <Card>
            <h2 className="text-lg font-bold">Pay with</h2>
            <p className="mt-1 text-sm text-muted">Move your money to the wallet you already use, as USDC or USDT on the chain you pick.</p>
            <div role="radiogroup" aria-label="Pay with" className="mt-4 space-y-2">
              <Choice selected={payWith === "NIM"} onClick={() => pickPayWith("NIM")}>
                <TokenLogo asset="NIM" />
                <span className="flex-1 font-medium">NIM</span>
                {nimBalance !== null && <span className="text-sm text-muted tabular-nums">{formatAsset(nimBalance, "NIM")}</span>}
              </Choice>
              <Choice selected={payWith === "USDT"} onClick={() => pickPayWith("USDT")}>
                <TokenLogo asset="USDT" />
                <span className="flex-1 font-medium">
                  USDT <span className="font-normal text-muted">on Polygon</span>
                </span>
              </Choice>
            </div>
            <Button block className="mt-4" onClick={() => go("chain")}>
              Continue
            </Button>
          </Card>
          {recent && recent.length > 0 && <RecentWithdrawals list={recent} onSelect={openExisting} />}
        </>
      )}

      {step === "chain" && (
        <Card>
          <h2 className="text-lg font-bold">Where should it arrive?</h2>
          <p className="mt-1 text-sm text-muted">Pick a chain, then a token.</p>
          {chain && !choosingChain ? (
            // Picked: the list folds away so the token and Continue sit right below, no scrolling.
            <div className="mt-4 flex items-center gap-3 border border-ink p-3 shadow-[inset_0_0_0_1px_var(--color-ink)]">
              <ChainLogo chain={chain.id} />
              <span className="flex-1 font-medium">{chain.name}</span>
              <TextButton muted={false} onClick={() => setChoosingChain(true)}>
                Change
              </TextButton>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Chain" className="mt-4 space-y-2">
              {CHAINS.map((c) =>
                c.available ? (
                  <Choice key={c.id} selected={chainId === c.id} onClick={() => pickChain(c.id)}>
                    <ChainLogo chain={c.id} />
                    <span className="flex-1 font-medium">{c.name}</span>
                  </Choice>
                ) : (
                  <Choice key={c.id} disabled>
                    <ChainLogo chain={c.id} muted />
                    <span className="flex-1">{c.name}</span>
                    <Badge variant="muted">Soon</Badge>
                  </Choice>
                ),
              )}
            </div>
          )}
          {chain && !choosingChain && (
            <Field label="Token" htmlFor="withdraw-token" className="mt-5">
              <Dropdown
                id="withdraw-token"
                aria-label="Token"
                value={asset}
                onChange={(v) => setAsset(v)}
                options={tokens.map((t) => ({
                  value: t.asset,
                  label: t.asset,
                  detail: `on ${chain.name}`,
                  icon: <TokenLogo asset={t.asset} className="h-5 w-5" />,
                }))}
              />
              {payWith === "USDT" && chain.id === "polygon" && (
                <p className="mt-1.5 text-xs text-muted">USDT on Polygon isn&apos;t offered: your USDT is already there.</p>
              )}
            </Field>
          )}
          {chain && !choosingChain && (
            <Button block className="mt-5" onClick={() => go("destination")}>
              Continue
            </Button>
          )}
        </Card>
      )}

      {step === "destination" && chain && (
        <Card>
          <h2 className="text-lg font-bold">Send to</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <TokenLogo asset={asset} className="h-4 w-4" /> {asset} on <ChainLogo chain={chain.id} className="h-4 w-4" /> {chain.name}
          </p>
          {offerNimiqPayAddress(chain, asset) && polygonWallet.available() && (
            <Button variant={usingMine ? "primary" : "secondary"} block className="mt-4" onClick={useMyAddress}>
              {usingMine ? "✓ Using my Nimiq Pay address" : "Use my Nimiq Pay address"}
            </Button>
          )}
          <Field
            label={offerNimiqPayAddress(chain, asset) && polygonWallet.available() ? "Or paste an address" : "Paste an address"}
            htmlFor="withdraw-destination"
            className="mt-4"
            hint={`An address on ${chain.name}. Money sent to an address on another chain is usually lost.`}
          >
            <Input
              id="withdraw-destination"
              mono
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                setUsingMine(false);
                setDestinationError(null);
              }}
              onBlur={() =>
                destination.trim() && setDestinationError(((r) => (r.ok ? null : r.message))(checkDestination(chain, destination)))
              }
              aria-invalid={!!destinationError}
              aria-describedby={destinationError ? "withdraw-destination-error" : undefined}
            />
          </Field>
          {destinationError && (
            <p id="withdraw-destination-error" className="mt-2 text-sm font-medium">
              {destinationError}
            </p>
          )}
          <Button block className="mt-5" disabled={!destination.trim()} onClick={confirmDestination}>
            Continue
          </Button>
        </Card>
      )}

      {step === "amount" && chain && (
        <Card>
          <h2 className="text-lg font-bold">How much?</h2>
          <p className="mt-1 text-sm text-muted">
            Between {RECEIVE_LIMITS.min} and {RECEIVE_LIMITS.max} {asset} per withdrawal.
          </p>
          <Field label="You receive exactly" htmlFor="withdraw-amount" className="mt-4">
            <div className="flex items-center gap-2">
              <TokenLogo asset={asset} />
              <Input
                id="withdraw-amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="10.00"
                value={receive}
                onChange={(e) => setReceive(e.target.value.replace(",", "."))}
                className="text-lg tabular-nums"
              />
              <span className="font-medium">{asset}</span>
            </div>
          </Field>
          {amountProblem ? (
            <p className="mt-2 text-sm font-medium">{amountProblem}</p>
          ) : (
            local &&
            Number(receive) > 0 && (
              <p className="mt-2 text-sm text-muted">≈ {formatFiat(Number(receive) * local.perUsdt, local.currency)}</p>
            )
          )}
          <p className="mt-3 text-sm text-muted">The next screen shows the fees and about how much {payWith} it takes.</p>
          <Button block className="mt-5" loading={busy} disabled={!receive.trim() || !!amountProblem || busy} onClick={getQuote}>
            Get quote
          </Button>
        </Card>
      )}

      {step === "review" && quote && chain && (
        <Review quote={quote} chainName={chain.name} usingMine={usingMine} busy={busy} onRefresh={getQuote} onApprove={approve} />
      )}

      {step === "tracking" && quote && chain && (
        <Tracking
          quote={quote}
          chainName={chain.name}
          withdrawal={withdrawal}
          onUpdate={setWithdrawal}
          onDone={() => go("receipt")}
          onReset={reset}
        />
      )}

      {step === "receipt" && quote && chain && (
        <Card>
          <div className="text-center">
            <p aria-hidden className="text-3xl">
              ✓
            </p>
            <h2 className="mt-1 text-lg font-bold">Done</h2>
            <p className="mt-1 flex items-center justify-center gap-1.5">
              <TokenLogo asset={quote.asset} className="h-5 w-5" />
              {stable(withdrawal?.receiveAmount ?? quote.receiveAmount)} {quote.asset} arrived on{" "}
              <ChainLogo chain={quote.chain} className="h-5 w-5" /> {chain.name}
            </p>
          </div>
          {quote.sample && (
            <Alert kind="warn" className="mt-4">
              This was a sample. No money moved and there is no transaction to show.
            </Alert>
          )}
          <DescriptionList
            className="mt-4 text-sm"
            rows={[
              { term: "You sent", detail: about(withdrawal?.sendEstimate ?? quote.sendEstimate, quote.payWith) },
              { term: "To", detail: quote.destination, mono: true },
              { term: "Via", detail: quote.providerName },
              ...(withdrawal ? [{ term: "Reference", detail: withdrawal.id, mono: true }] : []),
              ...(withdrawal?.destinationTxHash ? [{ term: "Transaction", detail: withdrawal.destinationTxHash, mono: true }] : []),
            ]}
          />
          {withdrawal?.explorerUrl && (
            <AnchorButton block className="mt-5" href={withdrawal.explorerUrl} target="_blank" rel="noreferrer">
              View on explorer
            </AnchorButton>
          )}
          <Button block variant="secondary" className="mt-3" onClick={reset}>
            New withdrawal
          </Button>
        </Card>
      )}

      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}

/** One option in a list: a chain, or what to pay with. Disabled ones are greyed out. */
function Choice({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={!!selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex min-h-12 w-full items-center gap-3 border p-3 text-left transition-colors",
        disabled
          ? "cursor-not-allowed border-line bg-subtle text-muted"
          : selected
            ? "border-ink shadow-[inset_0_0_0_1px_var(--color-ink)]"
            : "border-line bg-paper hover:border-ink",
      )}
    >
      {children}
      {selected && <span aria-hidden>✓</span>}
    </button>
  );
}

function Review({
  quote,
  chainName,
  usingMine,
  busy,
  onRefresh,
  onApprove,
}: {
  quote: QuoteView;
  chainName: string;
  usingMine: boolean;
  busy: boolean;
  onRefresh: () => void;
  onApprove: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Date.parse(quote.expiresAt) - now;
  const tooLate = left < APPROVE_MARGIN_MS;

  // Too close to expiry for Nimiq Pay to pay in time: fetch a fresh quote instead, once per quote
  // (if that fails, the error shows and the user can ask again; no retry loop).
  const [refreshedFor, setRefreshedFor] = useState<string | null>(null);
  useEffect(() => {
    if (refreshedFor === quote.expiresAt) return;
    const wait = Math.max(0, Date.parse(quote.expiresAt) - APPROVE_MARGIN_MS - Date.now());
    const t = setTimeout(() => {
      setRefreshedFor(quote.expiresAt);
      onRefresh();
    }, wait);
    return () => clearTimeout(t);
  }, [quote.expiresAt, refreshedFor, onRefresh]);
  const stuck = tooLate && !busy && refreshedFor === quote.expiresAt;

  return (
    <Card>
      <h2 className="text-lg font-bold">Review</h2>
      {quote.sample && (
        <Alert kind="warn" className="mt-3">
          Sample quote. Withdrawals aren&apos;t connected to a provider yet, so no money will move. Prices are live; fees are examples.
        </Alert>
      )}
      <div className="mt-4 border border-ink p-4">
        <p className="text-sm text-muted">They receive exactly</p>
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
          <TokenLogo asset={quote.asset} />
          {stable(quote.receiveAmount)} {quote.asset}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
          on <ChainLogo chain={quote.chain} className="h-4 w-4" /> {chainName} ·{" "}
          {usingMine ? "your Nimiq Pay address" : shortHex(quote.destination)}
        </p>
      </div>
      <DescriptionList
        className="mt-4 text-sm"
        rows={[
          { term: "You send", detail: about(quote.sendEstimate, quote.payWith) },
          ...quote.fees.map((f) => ({ term: f.label, detail: `${stable(f.amount)} ${f.asset}` })),
          ...(quote.receiveMin !== quote.receiveAmount
            ? [{ term: "At least", detail: `${stable(quote.receiveMin)} ${quote.asset} if the price moves` }]
            : []),
          { term: "Via", detail: `${quote.providerName} · about ${Math.round(quote.etaSeconds / 60)} min` },
        ]}
      />
      <p className="mt-3 text-xs text-muted">
        Nimiq Pay shows the exact amount when you approve, including its own fee. Swaps are executed non-custodially by {quote.providerName}{" "}
        via a Lightning hold invoice; NimBill never holds your funds.
      </p>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
        <span className="text-muted">Quote valid for</span>
        {stuck ? (
          <span>Expired</span>
        ) : tooLate ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" /> Getting a fresh quote…
          </span>
        ) : (
          <Countdown until={quote.expiresAt} />
        )}
      </div>
      {stuck ? (
        <Button block variant="secondary" className="mt-4" onClick={onRefresh}>
          Get a new quote
        </Button>
      ) : (
        <Button block className="mt-4" disabled={tooLate || busy} onClick={onApprove}>
          {quote.sample ? "Continue with the sample" : "Approve in Nimiq Pay"}
        </Button>
      )}
    </Card>
  );
}

/** Which of the three steps a real withdrawal is on (3 = all done). */
const STAGE_OF: Partial<Record<WithdrawalView["status"], number>> = { quoted: 0, paying: 0, swapping: 1, delivering: 2, delivered: 3 };

const OUTCOME: Partial<Record<WithdrawalView["status"], string>> = {
  expired: "The withdrawal ran out of time",
  cancelled: "Cancelled",
  refunded: "Refunded",
  failed: "Something went wrong",
};

/**
 * Progress after approval. A real withdrawal is followed by asking the server every few seconds
 * (which also moves it forward); a sample plays through the steps on a timer.
 */
function Tracking({
  quote,
  chainName,
  withdrawal,
  onUpdate,
  onDone,
  onReset,
}: {
  quote: QuoteView;
  chainName: string;
  withdrawal: WithdrawalView | null;
  onUpdate: (w: WithdrawalView) => void;
  onDone: () => void;
  onReset: () => void;
}) {
  const [sampleStage, setSampleStage] = useState(0);
  useEffect(() => {
    if (!quote.sample) return;
    if (sampleStage >= STAGES.length) {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setSampleStage((s) => s + 1), 1500);
    return () => clearTimeout(t);
  }, [quote.sample, sampleStage, onDone]);

  // A real withdrawal: ask again 3 s after each answer, until it is final.
  useEffect(() => {
    if (quote.sample || !withdrawal) return;
    if (withdrawal.status === "delivered") {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
    if (isFinal(withdrawal.status)) return;
    const t = setTimeout(() => {
      api<{ withdrawal: WithdrawalView }>(`/api/withdraw/${withdrawal.id}`)
        .then((r) => onUpdate(r.withdrawal))
        .catch(() => onUpdate({ ...withdrawal })); // keep asking after a network blip
    }, 3_000);
    return () => clearTimeout(t);
  }, [quote.sample, withdrawal, onUpdate, onDone]);

  const stage = quote.sample ? sampleStage : withdrawal ? (STAGE_OF[withdrawal.status] ?? 0) : 0;
  const outcome = withdrawal && !quote.sample ? OUTCOME[withdrawal.status] : undefined;

  const detail = (i: number) =>
    i === 0 ? STAGES[0].doing : i === 1 ? `${STAGES[1].doing} ${quote.asset}` : `${STAGES[2].doing} ${chainName}`;

  if (outcome && withdrawal) {
    return (
      <Card>
        <h2 className="text-lg font-bold">{outcome}</h2>
        {withdrawal.note && <p className="mt-2 text-sm">{withdrawal.note}</p>}
        <DescriptionList className="mt-4 text-sm" rows={[{ term: "Reference", detail: withdrawal.id, mono: true }]} />
        <Button block variant="secondary" className="mt-5" onClick={onReset}>
          Start again
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">
        Withdrawing {stable(quote.receiveAmount)} {quote.asset}
      </h2>
      <p className="mt-1 text-sm text-muted">
        Usually about {Math.round(quote.etaSeconds / 60)} minutes. You can close NimBill: it keeps tracking the withdrawal.
      </p>
      <ol className="mt-4 space-y-2">
        {STAGES.map((s, i) => {
          const state = i < stage ? "done" : i === stage ? "doing" : "todo";
          return (
            <li
              key={s.label}
              className={cx(
                "flex min-h-12 items-center gap-3 border p-3",
                state === "doing" ? "border-ink" : "border-line",
                state === "todo" && "text-muted",
              )}
            >
              <span aria-hidden className="flex h-5 w-5 items-center justify-center">
                {state === "done" ? "✓" : state === "doing" ? <Spinner size="sm" /> : "·"}
              </span>
              <span className="flex-1 font-medium">{s.label}</span>
              <span className="text-sm text-muted">{state === "done" ? s.done : state === "doing" ? `${detail(i)}…` : ""}</span>
            </li>
          );
        })}
      </ol>
      {withdrawal?.note && <p className="mt-3 text-sm">{withdrawal.note}</p>}
      {withdrawal?.explorerUrl && (
        <AnchorButton variant="secondary" size="sm" className="mt-3" href={withdrawal.explorerUrl} target="_blank" rel="noreferrer">
          View transaction
        </AnchorButton>
      )}
      {withdrawal && <p className="mt-3 text-xs text-muted">Reference: {withdrawal.id}</p>}
      {quote.sample && <p className="mt-3 text-xs text-muted">Sample: these steps are simulated.</p>}
    </Card>
  );
}

const STATUS_BADGE: Record<WithdrawalView["status"], { label: string; variant: "solid" | "outline" | "muted" }> = {
  requested: { label: "Requested", variant: "muted" },
  quoted: { label: "Awaiting approval", variant: "outline" },
  paying: { label: "Paying…", variant: "solid" },
  swapping: { label: "Swapping…", variant: "solid" },
  delivering: { label: "Delivering…", variant: "solid" },
  delivered: { label: "Delivered ✓", variant: "outline" },
  expired: { label: "Expired", variant: "muted" },
  cancelled: { label: "Cancelled", variant: "muted" },
  refund_pending: { label: "Refunding…", variant: "outline" },
  refunded: { label: "Refunded", variant: "muted" },
  failed: { label: "Needs check", variant: "solid" },
};

function RecentWithdrawals({ list, onSelect }: { list: WithdrawalView[]; onSelect: (w: WithdrawalView) => void }) {
  return (
    <Card padding="none" as="section" aria-label="Recent withdrawals">
      <div className="border-b border-line px-4 py-3">
        <h3 className="font-mono text-xs font-semibold tracking-wider text-muted uppercase">Your withdrawals</h3>
      </div>
      <ul className="divide-y divide-line">
        {list.map((w) => {
          const chain = getChain(w.chain);
          const badge = STATUS_BADGE[w.status] ?? { label: w.status, variant: "muted" as const };
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onSelect(w)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-subtle"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold tabular-nums">
                    <TokenLogo asset={w.asset} className="h-4 w-4" />
                    {stable(w.receiveAmount)} {w.asset}
                    {chain && <span className="font-normal text-muted">on {chain.name}</span>}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-xs text-muted">
                    {shortHex(w.destination)} · {w.id}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <p className="mt-1 text-[11px] text-muted">
                    {new Date(w.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
