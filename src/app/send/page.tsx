"use client";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { CurrencySelect } from "@/components/CurrencySelect";
import {
  Alert,
  AnchorButton,
  Button,
  Card,
  Field,
  Header,
  Input,
  LinkButton,
  Loader,
  OpenInNimiqPay,
  PageTitle,
  Spinner,
  TextLink,
} from "@/components/ui";
import { api } from "@/lib/client/api";
import { getNimiq, nimExplorerTx, useNimiq, walletErrorMessage } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { formatAsset, formatFiat, LUNA_PER_NIM } from "@/lib/currencies";
import { AppError } from "@/lib/errors";
import { formatTag, normalizeTag, tagProblem } from "@/lib/tags";
import type { TransferView } from "@/lib/transfers";

type Owner = { tag: string; handle: string; name: string; address: string; avatarUrl: string | null };
type Payment = { recipient: string; amount: string; memo: string };
type Phase =
  | { k: "form" }
  | { k: "creating" }
  | { k: "wallet"; transfer: TransferView; payment: Payment }
  | { k: "verifying"; transfer: TransferView; message: string }
  | { k: "done"; transfer: TransferView };

/** "NQ42 8K3M XXXX … 7Q2F": enough of the address to compare with what the recipient sees. */
const shortAddress = (a: string) => {
  const parts = a.split(" ");
  return parts.length > 4 ? `${parts.slice(0, 3).join(" ")} … ${parts[parts.length - 1]}` : a;
};

const amountText = (t: Pick<TransferView, "currency" | "fiatAmount" | "amount">) =>
  t.currency === "NIM" ? formatAsset(t.amount, "NIM") : formatFiat(t.fiatAmount, t.currency);

export default function SendPage() {
  return (
    <Suspense fallback={<Header back="/" />}>
      <Send />
    </Suspense>
  );
}

function Send() {
  const { merchant, loading } = useSession();
  const params = useSearchParams();
  if (loading) return <Header back="/" />;
  if (!merchant) {
    return (
      <>
        <Header back="/" />
        <OpenInNimiqPay text="Sign in with Nimiq Pay to send money." />
      </>
    );
  }
  return (
    <>
      <Header back="/" />
      <SendFlow initialTo={params.get("to") ?? ""} defaultCurrency={merchant.displayCurrency ?? "NIM"} myTag={merchant.tag} />
    </>
  );
}

/** Looks up the tag a moment after typing stops, so the sender sees who it belongs to. */
function useRecipient(value: string, myTag: string | null) {
  const tag = normalizeTag(value);
  const problem = tag ? tagProblem(tag) : null;
  const [found, setFound] = useState<{ tag: string; owner: Owner | null; message: string | null } | null>(null);
  useEffect(() => {
    if (!tag || problem || tag === myTag) return;
    const t = setTimeout(() => {
      api<{ owner: Owner }>(`/api/tags/${encodeURIComponent(tag)}`)
        .then((r) => setFound({ tag, owner: r.owner, message: null }))
        .catch((e) =>
          setFound({
            tag,
            owner: null,
            message: AppError.is(e) && e.code === "NOT_FOUND" ? "No one has that tag. Check the spelling." : (e as Error).message,
          }),
        );
    }, 350);
    return () => clearTimeout(t);
  }, [tag, problem, myTag]);

  if (!tag) return { tag, owner: null, message: null, checking: false };
  if (problem) return { tag, owner: null, message: "That isn't a NimBill tag.", checking: false };
  if (tag === myTag) return { tag, owner: null, message: "That's your own tag.", checking: false };
  if (found?.tag !== tag) return { tag, owner: null, message: null, checking: true };
  return { tag, owner: found.owner, message: found.message, checking: false };
}

function SendFlow({ initialTo, defaultCurrency, myTag }: { initialTo: string; defaultCurrency: string; myTag: string | null }) {
  const { state } = useNimiq();
  const [to, setTo] = useState(initialTo);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>({ k: "form" });
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<{ currency: string; nim: number } | null>(null);
  const recipient = useRecipient(to, myTag);
  const stopped = useRef(false);
  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

  // The live price, to show roughly how much NIM a fiat amount is before anything is sent.
  useEffect(() => {
    if (currency === "NIM") return;
    let alive = true;
    api<{ rates: { NIM: number } }>(`/api/rates?currency=${currency}`)
      .then((r) => alive && setRate({ currency, nim: r.rates.NIM }))
      .catch(() => alive && setRate(null));
    return () => {
      alive = false;
    };
  }, [currency]);

  const value = Number(amount);
  const validAmount = amount.trim() !== "" && value > 0 && Number.isFinite(value);
  const nimEstimate =
    currency === "NIM" ? (validAmount ? value : null) : validAmount && rate?.currency === currency ? value / rate.nim : null;
  const canSend = !!recipient.owner && validAmount && phase.k === "form";
  const typed = validAmount ? (currency === "NIM" ? `${value.toLocaleString("en")} NIM` : formatFiat(value, currency)) : "";

  /** Ask the server again until the transaction is in a block (≈3 minutes at most). */
  async function watch(transfer: TransferView, hash: string | null) {
    setPhase({ k: "verifying", transfer, message: "Confirming on the blockchain…" });
    for (let i = 0; i < 60 && !stopped.current; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000));
      try {
        if (hash) {
          const r = await api<{ status: string; message?: string; transfer?: TransferView }>(`/api/transfers/${transfer.id}/verify`, {
            body: { txHash: hash },
          });
          if (r.status === "confirmed" && r.transfer) return setPhase({ k: "done", transfer: r.transfer });
          if (r.status === "rejected") {
            setError(r.message ?? "This transfer could not be confirmed.");
            return setPhase({ k: "form" });
          }
          if (r.message) setPhase({ k: "verifying", transfer, message: r.message });
        } else {
          // The wallet couldn't say whether it was sent: look for it among the transfers instead.
          const r = await api<{ transfers: TransferView[] }>("/api/transfers");
          const found = r.transfers.find((t) => t.id === transfer.id);
          if (found?.status === "confirmed") return setPhase({ k: "done", transfer: found });
        }
      } catch {
        // a network blip: keep trying
      }
    }
    setError("We haven't seen the transfer on the blockchain yet. Check your Transfers list in a minute before sending again.");
    setPhase({ k: "form" });
  }

  async function send() {
    if (!recipient.owner) return;
    setError(null);
    setPhase({ k: "creating" });
    let created: { transfer: TransferView; payment: Payment };
    try {
      created = await api<{ transfer: TransferView; payment: Payment }>("/api/transfers", {
        body: { to: recipient.owner.tag, amount: value, currency, note: note.trim() || undefined },
      });
    } catch (e) {
      setError((e as Error).message);
      return setPhase({ k: "form" });
    }
    setPhase({ k: "wallet", ...created });
    try {
      const nimiq = await getNimiq();
      const hash = await nimiq.sendBasicTransactionWithData({
        recipient: created.payment.recipient,
        value: Number(created.payment.amount),
        data: created.payment.memo,
      });
      await watch(created.transfer, hash);
    } catch (e) {
      if ((e as { type?: string })?.type === "TRANSACTION_OUTCOME_UNKNOWN") return watch(created.transfer, null);
      setError(walletErrorMessage(e) ?? "Cancelled. Nothing was sent.");
      setPhase({ k: "form" });
    }
  }

  if (phase.k === "done") {
    const t = phase.transfer;
    return (
      <div className="space-y-4">
        <Card tone="inverse" className="text-center">
          <p className="font-mono text-[11px] tracking-wider text-paper/70 uppercase">Sent</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">{amountText(t)}</p>
          {t.currency !== "NIM" && <p className="mt-1 font-mono text-sm text-paper/70">{formatAsset(t.amount, "NIM")}</p>}
          <p className="mt-4 border-t border-paper/20 pt-4 text-sm">
            to <span className="font-semibold">{t.counterparty.name}</span> · <span className="font-mono">{t.counterparty.handle}</span>
          </p>
          {t.note && <p className="mt-1 text-sm text-paper/70">“{t.note}”</p>}
        </Card>
        {t.txHash && (
          <AnchorButton href={nimExplorerTx(t.txHash)} target="_blank" rel="noreferrer" variant="secondary" block>
            View on the blockchain
          </AnchorButton>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            block
            onClick={() => {
              setAmount("");
              setNote("");
              setPhase({ k: "form" });
            }}
          >
            Send again
          </Button>
          <LinkButton href="/" block>
            Done
          </LinkButton>
        </div>
      </div>
    );
  }

  if (phase.k === "verifying") {
    return (
      <Card className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
        <Spinner size="lg" />
        <p className="font-semibold">{phase.message}</p>
        <p className="text-sm text-muted">
          Sending {amountText(phase.transfer)} to {phase.transfer.counterparty.handle}. This usually takes a few seconds.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageTitle title="Send money" description="To anyone on NimBill, by their tag. It goes straight from your wallet to theirs." />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) void send();
        }}
      >
        <Card className="space-y-4">
          <Field label="To" htmlFor="to">
            <Input
              id="to"
              mono
              value={to}
              onChange={(e) => setTo(e.target.value.replace(/\s/g, ""))}
              placeholder="chidi@nimbill"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              autoFocus={!initialTo}
            />
          </Field>
          {recipient.checking && <p className="text-xs text-muted">Looking up {formatTag(recipient.tag)}…</p>}
          {recipient.message && <p className="text-xs font-medium">✕ {recipient.message}</p>}
          {recipient.owner && (
            <div className="border border-ink p-3">
              <div className="flex items-center gap-3">
                <Avatar src={recipient.owner.avatarUrl} name={recipient.owner.name} className="w-11 text-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate font-semibold">{recipient.owner.name}</p>
                    <span className="shrink-0 font-mono text-[11px] font-semibold">✓ TAG FOUND</span>
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-muted">{shortAddress(recipient.owner.address)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">Check the name before you send. Payments can&apos;t be undone.</p>
            </div>
          )}
        </Card>

        <Card className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] items-end gap-2">
            <Field label="Amount" htmlFor="amount">
              <Input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                className="text-lg font-bold tabular-nums"
                autoFocus={!!initialTo}
              />
            </Field>
            <div className="w-36">
              <CurrencySelect value={currency} onChange={setCurrency} coins="NIM" />
            </div>
          </div>
          <p className="text-xs text-muted">
            {currency === "NIM"
              ? "Sent as NIM."
              : nimEstimate !== null
                ? `≈ ${formatAsset(Math.ceil(nimEstimate * 100) * (LUNA_PER_NIM / 100), "NIM")} at the live rate. Sent as NIM.`
                : rate === null && validAmount
                  ? "Live rates are unavailable right now. Pick NIM to send without a rate."
                  : "Sent as NIM at the live rate."}
          </p>
          <Field label="Note" htmlFor="note" optional hint="Only you and the recipient see it.">
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lunch on Friday" maxLength={80} />
          </Field>
        </Card>

        {error && <Alert kind={/cancelled/i.test(error) ? "info" : "error"}>{error}</Alert>}

        {state === "checking" ? (
          <Loader compact />
        ) : state === "ready" ? (
          <Button
            type="submit"
            size="lg"
            block
            disabled={!canSend && phase.k === "form"}
            loading={phase.k === "creating" || phase.k === "wallet"}
            loadingText={phase.k === "wallet" ? "Confirm in your wallet…" : undefined}
          >
            {typed && recipient.owner ? `Send ${typed}` : "Send"}
          </Button>
        ) : (
          <OpenInNimiqPay text="Sending money needs the Nimiq Pay wallet." />
        )}
        <p className="text-center text-xs text-muted">Goes wallet to wallet. NimBill never holds it.</p>
      </form>

      <p className="mt-4 text-center text-sm">
        <TextLink href="/invoices?view=transfers" muted>
          See your transfers
        </TextLink>
      </p>
    </>
  );
}
