"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ChequeCard } from "@/components/ChequeCard";
import { CurrencySelect } from "@/components/CurrencySelect";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
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
} from "@/components/ui";
import { WriterShareCard } from "@/app/c/[id]/page";
import { formatChequeCode, linkKeyFromSecret, newChequeSecret, parseChequeInput } from "@/lib/cheque-crypto";
import type { PublicCheque } from "@/lib/cheques";
import { api } from "@/lib/client/api";
import { allSavedChequeSecrets, getSavedChequeSecret, saveChequeSecret } from "@/lib/client/cheque-secrets";
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
  | { k: "done"; cheque: PublicCheque; secret: string };

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
    </section>
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

  async function watchFunding(cheque: PublicCheque, secret: string, hash: string | null) {
    setPhase({ k: "verifying", cheque, secret, message: "Confirming on the blockchain…" });
    for (let i = 0; i < 60 && !stopped.current; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 1500 : 3000));
      try {
        const r = await api<{ status: string; message?: string; cheque?: PublicCheque }>(`/api/cheques/${cheque.id}/verify`, {
          body: hash ? { txHash: hash } : {},
        });
        if ((r.status === "funded" || r.status === "cashed") && r.cheque) {
          return setPhase({ k: "done", cheque: r.cheque, secret });
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
    let created: { cheque: PublicCheque; payment: Payment };
    try {
      created = await api<{ cheque: PublicCheque; payment: Payment }>("/api/cheques", {
        body: {
          amount: value,
          currency,
          linkPublicKey,
          recipientTag: kind === "tag" ? recipient.owner?.tag : undefined,
          note: note.trim() || undefined,
        },
      });
    } catch (e) {
      setError((e as Error).message);
      return setPhase({ k: "form" });
    }

    saveChequeSecret(created.cheque.id, secret);
    setPhase({ k: "wallet", ...created, secret });

    try {
      const nimiq = await getNimiq();
      const hash = await nimiq.sendBasicTransactionWithData({
        recipient: created.payment.recipient,
        value: Number(created.payment.amount),
        data: created.payment.memo,
      });
      await watchFunding(created.cheque, secret, typeof hash === "string" ? hash : null);
    } catch (e) {
      if ((e as { type?: string })?.type === "TRANSACTION_OUTCOME_UNKNOWN") {
        return watchFunding(created.cheque, secret, null);
      }
      setError(walletErrorMessage(e) ?? "Cancelled. Nothing was sent.");
      setPhase({ k: "form" });
    }
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
          Funding cheque {phase.cheque.number} with {amountText(phase.cheque)}.
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
          {currency === "NIM"
            ? "Funded in NIM."
            : nimEstimate !== null
              ? `≈ ${formatAsset(Math.ceil(nimEstimate * 100) * (LUNA_PER_NIM / 100), "NIM")} at the live rate. Locked inside the cheque as NIM.`
              : rate === null && validAmount
                ? "Live rates are unavailable right now. Pick NIM to write a cheque without a rate."
                : "Converted to NIM at the live rate when funded."}
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
  const saved = allSavedChequeSecrets();
  const backup = cheques
    .filter((c) => c.direction === "written" && (c.status === "funded" || c.status === "pending") && saved[c.id])
    .map((c) => `${c.number} · ${amountText(c)}: ${formatChequeCode(c.id, saved[c.id])}`)
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
                        {received ? "+" : ""}
                        {amountText(c)}
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
