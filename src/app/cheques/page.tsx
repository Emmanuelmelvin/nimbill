"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ChequeCard } from "@/components/ChequeCard";
import { CurrencySelect } from "@/components/CurrencySelect";
import {
  Alert,
  AnchorButton,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  CodeBlock,
  CoinText,
  CopyButton,
  Dropdown,
  EmptyState,
  Field,
  Header,
  Input,
  LinkButton,
  Loader,
  ModeSwitch,
  OpenInNimiqPay,
  PageTitle,
  SegmentedControl,
  Spinner,
  TabBar,
  TextButton,
  useCanShare,
} from "@/components/ui";
import { WriterShareCard } from "@/app/c/[id]/page";
import { formatChequeCode, linkKeyFromSecret, newChequeSecret, parseChequeInput, refundKeyFromSecret } from "@/lib/cheque-crypto";
import type { PublicCheque } from "@/lib/cheques";
import { api } from "@/lib/client/api";
import {
  allSavedChequeRefundSecrets,
  allSavedChequeSecrets,
  getSavedChequeSecret,
  lockChequeInHtlc,
  saveChequeRefundSecret,
  saveChequeSecret,
} from "@/lib/client/cheque-secrets";
import { getNimiq, useNimiq, walletErrorMessage } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { formatAsset, formatFiat, LUNA_PER_NIM } from "@/lib/currencies";
import { AppError } from "@/lib/errors";
import { shortAddress } from "@/lib/nimiq-address";
import { formatTag, normalizeTag, tagProblem } from "@/lib/tags";

type Tab = "write" | "cash" | "mine";
type ListFilter = "all" | "written" | "received";
type RecipientKind = "free" | "tag";
type Owner = { tag: string; handle: string; name: string; address: string; avatarUrl: string | null };
type Payment = { recipient: string; amount: string; memo: string; rate: string };
type WritePhase =
  | { k: "form" }
  | { k: "creating" }
  | { k: "wallet"; cheque: PublicCheque; payment: Payment; secret: string }
  | { k: "verifying"; cheque: PublicCheque; secret: string; message: string }
  | { k: "done"; cheque: PublicCheque; secret: string; refundSecret: string | null; backedUp: boolean };

const TABS = [
  { value: "write" as Tab, label: "Write" },
  { value: "cash" as Tab, label: "Cash" },
  { value: "mine" as Tab, label: "My cheques" },
] as const;

/** URL hash for each tab, so /cheques#cash and /cheques#mine can be linked to. */
const TAB_HASH: Record<Tab, string> = { write: "", cash: "#cash", mine: "#mine" };
const tabFromHash = (hash: string): Tab | null => (hash === "#cash" ? "cash" : hash === "#mine" ? "mine" : null);

const KINDS = [
  { value: "free" as RecipientKind, label: "Free (first to claim)" },
  { value: "tag" as RecipientKind, label: "For a @tag" },
] as const;

const amountText = (c: Pick<PublicCheque, "currency" | "fiatAmount" | "amount">) =>
  c.currency === "NIM" ? formatAsset(c.amount, "NIM") : formatFiat(c.fiatAmount, c.currency);

export default function ChequesPage() {
  // Starts on "write" on both the server and the first browser render (so hydration matches),
  // then the effect below switches to the tab in the URL hash.
  const [tab, setTab] = useState<Tab>("write");

  const selectTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", `/cheques${TAB_HASH[next]}`);
  };

  useEffect(() => {
    const syncHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  return (
    <>
      <Header />
      <ModeSwitch />
      <PageTitle
        title="Cheques"
        description="Money you can hand to anyone as a link, QR code or cheque code. Fully funded, so it never bounces."
      />
      <div className="space-y-5">
        <SegmentedControl label="Cheque action" options={TABS} value={tab} onChange={selectTab} block />
        {tab === "cash" ? (
          <CashByCode />
        ) : tab === "mine" ? (
          <MyCheques onSwitchToCash={() => selectTab("cash")} />
        ) : (
          <WriteAndManage onShowMine={() => selectTab("mine")} />
        )}
      </div>
      <TabBar />
    </>
  );
}

/** Open and cash a cheque from its pasted link or CHQ-… code. */
function CashByCode() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section id="cash" className="space-y-4">
      <Card>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = parseChequeInput(value);
            if (!parsed) {
              setError("That doesn't look like a cheque link or code. It starts with CHQ- or /c/.");
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await api<{ cheque: PublicCheque }>(`/api/cheques/${parsed.id}`);
              if (parsed.secret) saveChequeSecret(parsed.id, parsed.secret);
              router.push(`/c/${parsed.id}${parsed.secret ? `#${parsed.secret}` : ""}`);
            } catch (err) {
              setError(
                AppError.is(err) && err.code === "NOT_FOUND"
                  ? "No cheque has that code. Check it with whoever sent it."
                  : (err as Error).message,
              );
              setBusy(false);
            }
          }}
        >
          <CardHeader
            title="Cash a cheque"
            description="Paste the cheque link or CHQ-… code you were sent to open the cheque and claim the NIM."
          />
          <Field label="Cheque link or code" htmlFor="chq-code">
            <Input
              id="chq-code"
              mono
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="CHQ-XXXXX-XXXXX-… or https://…/c/…"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              autoFocus
            />
          </Field>
          {error && <Alert kind="error">{error}</Alert>}
          <Button type="submit" block loading={busy} disabled={!value.trim()}>
            Open cheque →
          </Button>
        </form>
      </Card>
      <EmergencyReclaimCard />
    </section>
  );
}

/**
 * Direct on-chain HTLC timeout reclaim (`OutgoingHTLCTransactionProof::TimeoutResolve`).
 * Talks straight to a public Nimiq RPC node from the browser and uses zero NimBill server calls,
 * so a writer can always recover an expired HTLC-protected cheque even if NimBill is unreachable.
 */
function EmergencyReclaimCard() {
  const { merchant } = useSession();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [htlcAddr, setHtlcAddr] = useState("");
  const [destAddr, setDestAddr] = useState("");
  const [rpcUrl, setRpcUrl] = useState("https://rpc.nimiqwatch.com");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ txHash: string; valueLuna: string } | null>(null);

  if (!open) {
    return (
      <p className="text-center text-xs text-muted">
        Wrote a cheque nobody cashed in 30 days, and NimBill isn&apos;t working?{" "}
        <TextButton onClick={() => setOpen(true)} muted={false} className="text-xs font-medium">
          Get your money back →
        </TextButton>
      </p>
    );
  }

  return (
    <Card tone="subtle" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Get back an uncashed cheque</p>
          <p className="text-xs text-muted">
            30 days after you write a cheque, you can take back money nobody cashed, even if NimBill is down. This goes straight to the
            Nimiq network, without NimBill. You need the cheque&apos;s refund key from your cheque key backup. The cheque link won&apos;t
            work here, so nobody you sent it to can do this.
          </p>
        </div>
        <TextButton onClick={() => setOpen(false)} className="text-xs">
          Hide
        </TextButton>
      </div>
      <Field label="Refund key (from your cheque key backup)" htmlFor="reclaim-code">
        <Input
          id="reclaim-code"
          mono
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          placeholder="24-character refund key"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Safety refund address" hint="Shown on the cheque, and in your cheque key backup." htmlFor="reclaim-htlc">
        <Input
          id="reclaim-htlc"
          mono
          value={htlcAddr}
          onChange={(e) => setHtlcAddr(e.target.value)}
          placeholder="NQxx xxxx …"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Send the money to (your Nimiq wallet)" htmlFor="reclaim-dest">
        <Input
          id="reclaim-dest"
          mono
          value={destAddr || merchant?.address || ""}
          onChange={(e) => setDestAddr(e.target.value)}
          placeholder="NQxx xxxx …"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Field label="Nimiq network server" hint="Advanced. Leave this as it is unless it doesn't respond." htmlFor="reclaim-rpc" optional>
        <Input id="reclaim-rpc" mono value={rpcUrl} onChange={(e) => setRpcUrl(e.target.value)} />
      </Field>
      {error && <Alert kind="error">{error}</Alert>}
      {done && (
        <Alert kind="info">
          <CoinText>Done: {formatAsset(done.valueLuna, "NIM")} is on its way back to your wallet.</CoinText>
        </Alert>
      )}
      <Button
        variant="secondary"
        block
        loading={busy}
        disabled={!code.trim() || !htlcAddr.trim()}
        onClick={async () => {
          const refundSecret = code.trim();
          const recipientAddress = (destAddr || merchant?.address || "").trim();
          setBusy(true);
          setError(null);
          setDone(null);
          try {
            const { reclaimExpiredHtlcCheque } = await import("@/lib/client/cheque-secrets");
            const res = await reclaimExpiredHtlcCheque({
              refundSecret,
              htlcAddress: htlcAddr,
              recipientAddress,
              rpcUrl,
            });
            setDone(res);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Get my money back
      </Button>
    </Card>
  );
}

/** Looks up a recipient tag when writing a tag-locked cheque. */
function useRecipientTag(value: string, myTag: string | null, enabled: boolean) {
  const tag = enabled ? normalizeTag(value) : "";
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

  if (!enabled || !tag) return { tag, owner: null, message: null, checking: false };
  if (problem) return { tag, owner: null, message: "That isn't a NimBill tag.", checking: false };
  if (tag === myTag) return { tag, owner: null, message: "That's your own tag.", checking: false };
  if (found?.tag !== tag) return { tag, owner: null, message: null, checking: true };
  return { tag, owner: found.owner, message: found.message, checking: false };
}

function WriteAndManage({ onShowMine }: { onShowMine: () => void }) {
  const { merchant, loading } = useSession();
  if (loading) return <Loader compact />;
  if (!merchant) {
    return <OpenInNimiqPay text="Sign in with Nimiq Pay to write or manage cheques." />;
  }
  return (
    <div className="space-y-4">
      <WriteChequeForm defaultCurrency={merchant.displayCurrency ?? "NIM"} myTag={merchant.tag} />
      <p className="text-center text-xs">
        <button type="button" onClick={onShowMine} className="font-medium underline underline-offset-4">
          See all your cheques →
        </button>
      </p>
    </div>
  );
}

/** Every cheque you wrote, cashed, or that is made out to your @tag. */
function MyCheques({ onSwitchToCash }: { onSwitchToCash: () => void }) {
  const { merchant, loading } = useSession();
  if (loading) return <Loader compact />;
  if (!merchant) return <OpenInNimiqPay text="Sign in with Nimiq Pay to see your cheques." />;
  return <ChequeList onSwitchToCash={onSwitchToCash} />;
}

function WriteChequeForm({ defaultCurrency, myTag }: { defaultCurrency: string; myTag: string | null }) {
  const { state } = useNimiq();
  const [kind, setKind] = useState<RecipientKind>("free");
  const [toTag, setToTag] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<WritePhase>({ k: "form" });
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<{ currency: string; nim: number } | null>(null);
  const recipient = useRecipientTag(toTag, myTag, kind === "tag");
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;
    return () => {
      stopped.current = true;
    };
  }, []);

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
  const recipientReady = kind === "free" || !!recipient.owner;
  const canWrite = validAmount && recipientReady && phase.k === "form";
  const typed = validAmount ? (currency === "NIM" ? `${value.toLocaleString("en")} NIM` : formatFiat(value, currency)) : "";

  async function watchFunding(cheque: PublicCheque, secret: string, refundSecret: string, hash: string | null) {
    setPhase({ k: "verifying", cheque, secret, message: "Confirming on the blockchain…" });
    for (let i = 0; i < 60 && !stopped.current; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000));
      try {
        const r = await api<{ status: string; message?: string; cheque?: PublicCheque }>(`/api/cheques/${cheque.id}/verify`, {
          body: hash ? { txHash: hash } : {},
        });
        if ((r.status === "funded" || r.status === "cashed") && r.cheque) {
          let finalCheque = r.cheque;
          if (r.status === "funded" && r.cheque.htlc?.refundAddress && !r.cheque.htlc.contractAddress) {
            setPhase({ k: "verifying", cheque: r.cheque, secret, message: "Turning on the 30-day safety refund…" });
            try {
              const locked = await lockChequeInHtlc({ id: r.cheque.id, secret });
              finalCheque = locked.cheque;
            } catch {
              // If locking fails for any transient reason, the cheque is still funded and can be locked/cashed from its page.
            }
          }
          // The refund key only matters while the cheque can still be refunded: skip the backup step
          // for a cheque that was cashed before we got here.
          const needsBackup = finalCheque.status === "funded" && !!finalCheque.htlc?.refundAddress;
          return setPhase({
            k: "done",
            cheque: finalCheque,
            secret,
            refundSecret: needsBackup ? refundSecret : null,
            backedUp: !needsBackup,
          });
        }
        if (r.status === "rejected") {
          setError(r.message ?? "This cheque could not be confirmed.");
          return setPhase({ k: "form" });
        }
        if (r.message) setPhase({ k: "verifying", cheque, secret, message: r.message });
      } catch {
        // network blip: keep polling
      }
    }
    setError("We haven't seen the funding transaction yet. Check My cheques in a minute before funding again.");
    setPhase({ k: "form" });
  }

  async function writeAndFund() {
    if (!canWrite) return;
    setError(null);
    setPhase({ k: "creating" });
    const secret = newChequeSecret();
    const { publicKey: linkPublicKey } = linkKeyFromSecret(secret);
    // A separate secret for the 30-day refund: it stays with the writer, unlike the link secret.
    const refundSecret = newChequeSecret();
    const { address: refundAddress } = refundKeyFromSecret(refundSecret);
    let created: { cheque: PublicCheque; payment: Payment };
    try {
      created = await api<{ cheque: PublicCheque; payment: Payment }>("/api/cheques", {
        body: {
          amount: value,
          currency,
          linkPublicKey,
          refundAddress,
          recipientTag: kind === "tag" ? recipient.owner?.tag : undefined,
          note: note.trim() || undefined,
        },
      });
    } catch (e) {
      setError((e as Error).message);
      return setPhase({ k: "form" });
    }

    saveChequeSecret(created.cheque.id, secret);
    saveChequeRefundSecret(created.cheque.id, refundSecret);
    setPhase({ k: "wallet", ...created, secret });

    try {
      const nimiq = await getNimiq();
      const hash = await nimiq.sendBasicTransactionWithData({
        recipient: created.payment.recipient,
        value: Number(created.payment.amount),
        data: created.payment.memo,
      });
      await watchFunding(created.cheque, secret, refundSecret, typeof hash === "string" ? hash : null);
    } catch (e) {
      if ((e as { type?: string })?.type === "TRANSACTION_OUTCOME_UNKNOWN") {
        return watchFunding(created.cheque, secret, refundSecret, null);
      }
      setError(walletErrorMessage(e) ?? "Cancelled. Nothing was sent.");
      setPhase({ k: "form" });
    }
  }

  if (phase.k === "done" && !phase.backedUp && phase.refundSecret) {
    return (
      <div className="space-y-4">
        <ChequeCard cheque={phase.cheque} />
        <RefundKeyBackup cheque={phase.cheque} refundSecret={phase.refundSecret} onDone={() => setPhase({ ...phase, backedUp: true })} />
      </div>
    );
  }

  if (phase.k === "done") {
    return (
      <div className="space-y-4">
        <ChequeCard cheque={phase.cheque} />
        <WriterShareCard cheque={phase.cheque} secret={phase.secret} />
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
            Write another
          </Button>
          <LinkButton href={`/c/${phase.cheque.id}#${phase.secret}`} variant="secondary" block>
            Open cheque page
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
          <CoinText>
            Funding cheque {phase.cheque.number} with {amountText(phase.cheque)}.
          </CoinText>
        </p>
      </Card>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canWrite) void writeAndFund();
      }}
    >
      <Card className="space-y-4">
        <Field label="Who can cash this cheque?" htmlFor="cheque-kind">
          <SegmentedControl label="Who can cash this cheque" options={KINDS} value={kind} onChange={setKind} block size="sm" />
        </Field>
        {kind === "free" ? (
          <p className="text-xs text-muted">
            Anyone with the link, QR code or cheque code can claim it — the first person to cash it gets the full amount.
          </p>
        ) : (
          <div className="space-y-3">
            <Field label="Recipient's NimBill tag" htmlFor="cheque-to">
              <Input
                id="cheque-to"
                mono
                value={toTag}
                onChange={(e) => setToTag(e.target.value.replace(/\s/g, ""))}
                placeholder="ada@nimbill"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
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
                      <span className="shrink-0 font-mono text-[11px] font-semibold">✓ LOCKED TO TAG</span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-muted">{shortAddress(recipient.owner.address)}</p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted">Only {recipient.owner.handle} can cash this cheque.</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Amount" htmlFor="cheque-amount">
            <Input
              id="cheque-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="text-lg font-bold tabular-nums"
            />
          </Field>
          <div className="w-36">
            <CurrencySelect value={currency} onChange={setCurrency} coins="NIM" />
          </div>
        </div>
        <p className="text-xs text-muted">
          <CoinText>
            {currency === "NIM"
              ? "Funded in NIM."
              : nimEstimate !== null
                ? `≈ ${formatAsset(Math.ceil(nimEstimate * 100) * (LUNA_PER_NIM / 100), "NIM")} at the live rate. Locked inside the cheque as NIM.`
                : rate === null && validAmount
                  ? "Live rates are unavailable right now. Pick NIM to write a cheque without a rate."
                  : "Converted to NIM at the live rate when funded."}
          </CoinText>
        </p>
        <Field label="For" htmlFor="cheque-note" optional hint="Shown on the face of the cheque.">
          <Input id="cheque-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Happy birthday!" maxLength={80} />
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
          disabled={!canWrite && phase.k === "form"}
          loading={phase.k === "creating" || phase.k === "wallet"}
          loadingText={phase.k === "wallet" ? "Confirm in your wallet…" : undefined}
        >
          {typed ? `Write & fund ${typed} cheque` : "Write & fund cheque"}
        </Button>
      ) : (
        <OpenInNimiqPay text="Funding a cheque needs the Nimiq Pay wallet." />
      )}
    </form>
  );
}

const formatDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

/** The text a writer saves: everything needed to get the money back without NimBill. */
function refundBackupText(cheque: PublicCheque, refundSecret: string): string {
  const after = formatDay(cheque.htlc?.timeoutAt);
  return [
    `NimBill cheque ${cheque.number} · ${amountText(cheque)}`,
    `Refund key: ${refundSecret}`,
    cheque.htlc?.contractAddress
      ? `Safety refund address: ${cheque.htlc.contractAddress}`
      : "Safety refund address: shown on the cheque page once the safety refund is on",
    "",
    `If nobody cashes this cheque, you can take the money back${after ? ` after ${after}` : " 30 days after writing it"}, even if NimBill is down: open Cheques, tap "Get your money back" and enter the refund key and safety refund address.`,
    "Keep this private. Anyone with the refund key can take the money back after that date.",
  ].join("\n");
}

/**
 * Shown right after a cheque is funded, before the share link: the writer's refund key is never in
 * the link and only lives in this browser, so losing it (cleared storage, new phone) while NimBill
 * is down would leave the money stuck. The copy or email stays on the writer's device: NimBill's
 * server never sees the refund key.
 */
function RefundKeyBackup({ cheque, refundSecret, onDone }: { cheque: PublicCheque; refundSecret: string; onDone: () => void }) {
  const canShare = useCanShare();
  const [saved, setSaved] = useState(false);
  const text = refundBackupText(cheque, refundSecret);
  const subject = `Refund key for NimBill cheque ${cheque.number}`;
  const after = formatDay(cheque.htlc?.timeoutAt) ?? "30 days";

  return (
    <Card tone="strong" className="space-y-3">
      <div>
        <p className="font-semibold">Save your refund key first</p>
        <p className="text-xs text-muted">
          If nobody cashes this cheque, this key lets you take the money back after {after}, even if NimBill is down. It isn&apos;t in the
          cheque link, and NimBill doesn&apos;t keep a copy. It&apos;s only saved in this browser, so if you clear it or change phones, this
          copy is the only one.
        </p>
      </div>
      <CodeBlock className="space-y-1">
        <p>{cheque.number}</p>
        <p>Refund key: {refundSecret}</p>
        {cheque.htlc?.contractAddress && <p>Safety refund address: {cheque.htlc.contractAddress}</p>}
      </CodeBlock>
      <p className="text-xs text-muted">Copying or emailing saves these with the steps to get your money back.</p>
      <div className="grid grid-cols-2 gap-2">
        <CopyButton text={text} label="Copy" variant="primary" size="sm" className="min-h-11" />
        {canShare ? (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-11"
            onClick={() => navigator.share({ title: subject, text }).catch(() => {})}
          >
            Save or email
          </Button>
        ) : (
          <AnchorButton
            variant="secondary"
            size="sm"
            className="min-h-11"
            href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}
          >
            Email to myself
          </AnchorButton>
        )}
      </div>
      <p className="text-xs text-muted">Don&apos;t send this to the person you&apos;re paying. They get the cheque link next.</p>
      <Checkbox label="I've saved my refund key" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      <Button block disabled={!saved} onClick={onDone}>
        Continue to the cheque link
      </Button>
    </Card>
  );
}

const FILTERS = [
  { value: "all" as ListFilter, label: "All" },
  { value: "written" as ListFilter, label: "Written" },
  { value: "received" as ListFilter, label: "Received" },
] as const;

function statusLabel(c: PublicCheque): string {
  const received = c.direction === "received";
  switch (c.status) {
    case "funded":
      return received ? "Ready to cash" : "Funded · open";
    case "settling":
      return "Cashing…";
    case "cashed":
      return received ? "Cashed by you ✓" : "Cashed ✓";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unfunded";
  }
}

function ChequeList({ onSwitchToCash }: { onSwitchToCash: () => void }) {
  const [cheques, setCheques] = useState<PublicCheque[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("all");

  useEffect(() => {
    api<{ cheques: PublicCheque[] }>("/api/cheques")
      .then((r) => setCheques(r.cheques))
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) return <Alert kind="error">{error}</Alert>;
  if (!cheques) return <Loader compact />;

  // The link secret only lives in this browser. Let the writer copy every open cheque's code
  // somewhere safe, since without it a cheque can't be cancelled.
  // The refund key and address (for the 30-day safety refund) are backed up too: they are never in the link.
  const saved = allSavedChequeSecrets();
  const refunds = allSavedChequeRefundSecrets();
  const backup = cheques
    .filter((c) => c.direction === "written" && (c.status === "funded" || c.status === "pending") && (saved[c.id] || refunds[c.id]))
    .map((c) =>
      [
        `${c.number} · ${amountText(c)}`,
        saved[c.id] ? formatChequeCode(c.id, saved[c.id]) : null,
        refunds[c.id] ? `refund key ${refunds[c.id]}` : null,
        refunds[c.id] && c.htlc?.contractAddress ? `safety refund address ${c.htlc.contractAddress}` : null,
      ]
        .filter(Boolean)
        .join(": "),
    )
    .join("\n");

  const counts = {
    all: cheques.length,
    written: cheques.filter((c) => c.direction === "written").length,
    received: cheques.filter((c) => c.direction === "received").length,
  };
  const shown = filter === "all" ? cheques : cheques.filter((c) => c.direction === filter);
  const empty =
    filter === "received"
      ? { title: "No cheques received yet", description: "Cheques you cash, or that are made out to your @tag, show up here." }
      : { title: "No cheques written yet", description: "Write a cheque to get a shareable link and QR code." };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-semibold tracking-wider text-muted uppercase">Your cheques</h2>
        <button type="button" onClick={onSwitchToCash} className="text-xs font-medium underline underline-offset-4">
          Got a cheque to cash?
        </button>
      </div>
      <Dropdown
        aria-label="Show cheques"
        options={FILTERS.map((f) => ({ ...f, detail: String(counts[f.value]) }))}
        value={filter}
        onChange={setFilter}
        labels="name"
      />
      {backup && filter !== "received" && (
        <div className="flex items-center justify-between gap-3 border border-line p-3">
          <p className="text-xs text-muted">Cheque keys are only saved in this browser. Copy them somewhere safe.</p>
          <CopyButton text={backup} label="Back up keys" variant="secondary" size="sm" className="shrink-0" />
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState title={empty.title} description={empty.description} />
      ) : (
        <Card as="div" padding="none">
          <ul className="divide-y divide-line">
            {shown.map((c) => {
              const secret = getSavedChequeSecret(c.id);
              const href = `/c/${c.id}${secret ? `#${secret}` : ""}`;
              const received = c.direction === "received";
              const title = received
                ? `From ${c.writer.name}${c.writer.handle ? ` · ${c.writer.handle}` : ""}`
                : c.recipient.kind === "tag"
                  ? `To ${c.recipient.handle}`
                  : c.status === "cashed" && c.claimedBy
                    ? `Free cheque · cashed by ${c.claimedBy.name}`
                    : "Free cheque · anyone";
              return (
                <li key={c.id}>
                  <Link href={href} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-subtle">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{title}</p>
                      <p className="truncate text-xs text-muted">
                        <span className="font-mono">{received ? "RECEIVED" : "WRITTEN"}</span> · {c.number}
                        {c.note ? ` · ${c.note}` : ""}
                      </p>
                      <p className="text-[11px] text-muted">
                        {new Date(c.settledAt ?? c.createdAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-bold tabular-nums">
                        <CoinText>
                          {received ? "+" : ""}
                          {amountText(c)}
                        </CoinText>
                      </p>
                      <Badge variant={c.status === "funded" ? "solid" : c.status === "cashed" ? "outline" : "muted"}>
                        {statusLabel(c)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
