"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { ChequeCard } from "@/components/ChequeCard";
import {
  Alert,
  AnchorButton,
  Button,
  Card,
  CodeBlock,
  CoinText,
  CopyButton,
  Field,
  Input,
  LinkButton,
  Loader,
  LogoMark,
  TextLink,
  useCanShare,
  useOrigin,
} from "@/components/ui";
import { formatChequeCode, isValidChequeSecret, normalizeChequeSecret, parseChequeInput } from "@/lib/cheque-crypto";
import type { PublicCheque } from "@/lib/cheques";
import { api } from "@/lib/client/api";
import {
  getSavedChequeRefundSecret,
  getSavedChequeSecret,
  lockChequeInHtlc,
  reclaimExpiredHtlcCheque,
  saveChequeSecret,
  settleCheque,
} from "@/lib/client/cheque-secrets";
import { getNimiq, nimExplorerTx, useNimiq } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { formatAsset, formatFiat } from "@/lib/currencies";
import { AppError } from "@/lib/errors";
import { normalizeAddress, shortAddress } from "@/lib/nimiq-address";
import { formatTag, normalizeTag, tagProblem } from "@/lib/tags";

type TagOwner = { tag: string; handle: string; name: string; address: string; avatarUrl: string | null };

export default function ClaimChequePage() {
  const { id } = useParams<{ id: string }>();
  const [cheque, setCheque] = useState<PublicCheque | null>(null);
  const [secret, setSecret] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hashSecret = normalizeChequeSecret(window.location.hash);
    if (hashSecret && isValidChequeSecret(hashSecret)) return hashSecret;
    return getSavedChequeSecret(id);
  });
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);

  useEffect(() => {
    const hashSecret = normalizeChequeSecret(window.location.hash);
    if (hashSecret && isValidChequeSecret(hashSecret)) {
      saveChequeSecret(id, hashSecret);
    }
    const onHash = () => {
      const next = normalizeChequeSecret(window.location.hash);
      if (next && isValidChequeSecret(next)) {
        saveChequeSecret(id, next);
        setSecret(next);
      }
    };
    window.addEventListener("hashchange", onHash);

    api<{ cheque: PublicCheque }>(`/api/cheques/${encodeURIComponent(id)}`)
      .then((r) => {
        setCheque(r.cheque);
      })
      .catch((e) => setError({ notFound: AppError.is(e) && e.code === "NOT_FOUND", message: (e as Error).message }));

    return () => window.removeEventListener("hashchange", onHash);
  }, [id]);

  // While a cash/cancel transaction is waiting for a block, check back until it's confirmed.
  const settling = cheque?.status === "settling";
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(() => {
      api<{ cheque: PublicCheque }>(`/api/cheques/${encodeURIComponent(id)}`)
        .then((r) => {
          setCheque(r.cheque);
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [settling, id]);

  return (
    <div className="pt-6">
      <Link href="/" className="mx-auto flex w-max items-center gap-2 text-ink" aria-label="NimBill home">
        <LogoMark size={24} />
        <span className="font-bold tracking-tighter">NimBill</span>
      </Link>
      <div className="mt-6">
        {error ? (
          <div className="border border-ink p-6 text-center">
            <p className="text-lg font-bold">{error.notFound ? "Cheque not found" : "Couldn't load this cheque"}</p>
            <p className="mt-1 text-sm text-muted">{error.notFound ? "Check the link or cheque code you were given." : error.message}</p>
            <LinkButton href="/cheques#cash" variant="secondary" size="sm" className="mt-4">
              Try another cheque code
            </LinkButton>
          </div>
        ) : cheque ? (
          <ChequeScreen
            cheque={cheque}
            secret={secret}
            onSecret={(s) => {
              saveChequeSecret(cheque.id, s);
              setSecret(s);
            }}
            onUpdated={setCheque}
          />
        ) : (
          <Loader />
        )}
      </div>
    </div>
  );
}

function ChequeScreen({
  cheque,
  secret,
  onSecret,
  onUpdated,
}: {
  cheque: PublicCheque;
  secret: string | null;
  onSecret: (s: string) => void;
  onUpdated: (c: PublicCheque) => void;
}) {
  const { merchant: me } = useSession();
  const { state: walletState } = useNimiq();
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [destInput, setDestInput] = useState("");
  const [claimerName, setClaimerName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"cash" | "cancel" | "lock" | "reclaim" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reclaimTxHash, setReclaimTxHash] = useState<string | null>(null);
  const [nowMs] = useState<number>(() => Date.now());

  // If inside Nimiq Pay and not signed in, ask the wallet for the active Nimiq address.
  useEffect(() => {
    if (me?.address || walletState !== "ready") return;
    getNimiq()
      .then((n) => n.listAccounts())
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts[0]) setWalletAddr(accounts[0]);
      })
      .catch(() => {});
  }, [me?.address, walletState]);

  // Look up a @tag if the user typed one instead of an NQ… address.
  const rawDest = destInput.trim();
  const directAddress = normalizeAddress(rawDest);
  const maybeTag = !directAddress && rawDest ? normalizeTag(rawDest) : "";
  const tagInvalid = maybeTag ? tagProblem(maybeTag) : null;
  const [tagLookup, setTagLookup] = useState<{ tag: string; owner: TagOwner | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!maybeTag || tagInvalid) return;
    const t = setTimeout(() => {
      api<{ owner: TagOwner }>(`/api/tags/${encodeURIComponent(maybeTag)}`)
        .then((r) => setTagLookup({ tag: maybeTag, owner: r.owner, error: null }))
        .catch(() => setTagLookup({ tag: maybeTag, owner: null, error: "No one has that tag." }));
    }, 300);
    return () => clearTimeout(t);
  }, [maybeTag, tagInvalid]);

  const defaultMyAddress = me?.address ?? walletAddr;
  const resolvedRecipient =
    cheque.recipient.kind === "tag"
      ? cheque.recipient.address
      : rawDest
        ? (directAddress ?? (tagLookup?.tag === maybeTag ? (tagLookup.owner?.address ?? null) : null))
        : defaultMyAddress;

  const displayAmount = cheque.currency === "NIM" ? formatAsset(cheque.amount, "NIM") : formatFiat(cheque.fiatAmount, cheque.currency);
  const htlcExpired = !!cheque.htlc?.timeoutMs && nowMs >= cheque.htlc.timeoutMs;
  const htlcTimeoutDate = cheque.htlc?.timeoutAt
    ? new Date(cheque.htlc.timeoutAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;
  // The writer's refund key lives only in the browser that wrote the cheque (and their backup).
  const [refundSecret] = useState<string | null>(() => (cheque.isWriter ? getSavedChequeRefundSecret(cheque.id) : null));

  // If the lock didn't happen right after funding (tab closed, network blip), retry it once when
  // the writer opens the cheque, so the 30-day protection doesn't silently stay off.
  const autoLockTried = useRef(false);
  useEffect(() => {
    const needsLock =
      cheque.status === "funded" &&
      cheque.isWriter &&
      !!secret &&
      !!cheque.htlc &&
      !cheque.htlc.contractAddress &&
      !!cheque.htlc.timeoutMs &&
      cheque.htlc.timeoutMs > nowMs;
    if (!needsLock || autoLockTried.current || !secret) return;
    autoLockTried.current = true;
    lockChequeInHtlc({ id: cheque.id, secret })
      .then((res) => onUpdated(res.cheque))
      .catch(() => {
        // Leave the manual "Activate" button for the writer to retry.
      });
  }, [cheque.status, cheque.isWriter, cheque.htlc, cheque.id, secret, nowMs, onUpdated]);

  async function runAction(action: "cash" | "cancel") {
    if (!secret) return;
    const target = action === "cancel" ? (me?.address ?? cheque.writer.address) : (resolvedRecipient ?? "");
    if (!target) {
      setActionError("Enter your NimBill tag or Nimiq wallet address to receive the funds.");
      return;
    }
    setBusy(action);
    setActionError(null);
    try {
      const res = await settleCheque({
        id: cheque.id,
        secret,
        action,
        chequePublicKey: cheque.chequePublicKey,
        recipientAddress: target,
        claimerName: claimerName.trim() || me?.name || tagLookup?.owner?.name || undefined,
      });
      onUpdated(res.cheque);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runHtlcLock() {
    if (!secret) return;
    setBusy("lock");
    setActionError(null);
    try {
      const res = await lockChequeInHtlc({ id: cheque.id, secret });
      onUpdated(res.cheque);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runDirectReclaim() {
    if (!cheque.htlc?.contractAddress) return;
    if (!refundSecret) {
      setActionError("This browser doesn't have the cheque's refund key. Use the on-chain reclaim tool on the Cheques page with your key backup.");
      return;
    }
    setBusy("reclaim");
    setActionError(null);
    try {
      const res = await reclaimExpiredHtlcCheque({
        refundSecret,
        htlcAddress: cheque.htlc.contractAddress,
        expectedRefundAddress: cheque.htlc.refundAddress,
        // The refund always goes back to the writer's own wallet.
        recipientAddress: cheque.writer.address,
      });
      setReclaimTxHash(res.txHash);
      api<{ cheque: PublicCheque }>(`/api/cheques/${encodeURIComponent(cheque.id)}`)
        .then((r) => onUpdated(r.cheque))
        .catch(() => {});
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <ChequeCard cheque={cheque} />

      {cheque.status === "cashed" && (
        <Card tone="inverse" className="space-y-2 text-center">
          <p className="font-mono text-[11px] tracking-wider text-paper/70 uppercase">Cashed</p>
          <p className="text-2xl font-bold tabular-nums">
            <CoinText>{displayAmount}</CoinText>
          </p>
          {cheque.claimedBy && (
            <p className="text-sm text-paper/80">
              Claimed by <span className="font-semibold text-paper">{cheque.claimedBy.name}</span>
              {cheque.claimedBy.handle && <span className="font-mono"> · {cheque.claimedBy.handle}</span>}
            </p>
          )}
          {cheque.settleTxHash && (
            <div className="pt-2">
              <AnchorButton href={nimExplorerTx(cheque.settleTxHash)} target="_blank" rel="noreferrer" variant="secondary" size="sm">
                View on the blockchain ↗
              </AnchorButton>
            </div>
          )}
        </Card>
      )}

      {cheque.status === "cancelled" && (
        <Card tone="subtle" className="space-y-2 text-center">
          <p className="font-semibold">This cheque was cancelled</p>
          <p className="text-sm text-muted">The funds were returned to {cheque.writer.name}&apos;s wallet.</p>
          {cheque.settleTxHash && (
            <AnchorButton href={nimExplorerTx(cheque.settleTxHash)} target="_blank" rel="noreferrer" variant="secondary" size="sm">
              View on the blockchain ↗
            </AnchorButton>
          )}
        </Card>
      )}

      {cheque.status === "settling" && (
        <Card tone="subtle" className="space-y-2 text-center" aria-live="polite">
          <p className="font-semibold">Confirming on the blockchain…</p>
          <p className="text-sm text-muted">
            The transaction was sent{cheque.claimedBy ? ` to ${cheque.claimedBy.name}` : ""}. This usually takes a few seconds.
          </p>
          {cheque.settleTxHash && (
            <AnchorButton href={nimExplorerTx(cheque.settleTxHash)} target="_blank" rel="noreferrer" variant="secondary" size="sm">
              View on the blockchain ↗
            </AnchorButton>
          )}
        </Card>
      )}

      {cheque.status === "pending" && (
        <Alert kind="info">This cheque is still waiting for its funding transaction to confirm on the blockchain.</Alert>
      )}

      {cheque.status === "funded" && !secret && (
        <Card className="space-y-3">
          <p className="font-semibold">Enter the cheque code to unlock</p>
          <p className="text-xs text-muted">
            To keep NimBill non-custodial, the key that unlocks this cheque travels in the full link or cheque code. Paste it below.
          </p>
          <Field label="Cheque code or full link" htmlFor="unlock-code">
            <Input
              id="unlock-code"
              mono
              value={codeInput}
              onChange={(e) => {
                setCodeInput(e.target.value);
                setCodeError(null);
              }}
              placeholder="CHQ-XXXXX-XXXXX-XXXXXX-…"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          {codeError && <Alert kind="error">{codeError}</Alert>}
          <Button
            block
            disabled={!codeInput.trim()}
            onClick={() => {
              const parsed = parseChequeInput(codeInput);
              if (parsed?.secret && parsed.id === cheque.id) {
                onSecret(parsed.secret);
              } else if (isValidChequeSecret(codeInput)) {
                onSecret(normalizeChequeSecret(codeInput));
              } else {
                setCodeError("That code doesn't carry the secret for this cheque. Check the full link or code from the sender.");
              }
            }}
          >
            Unlock cheque
          </Button>
        </Card>
      )}

      {cheque.status === "funded" && secret && !cheque.isWriter && (
        <Card className="space-y-4">
          {cheque.recipient.kind === "tag" ? (
            <div className="space-y-2">
              <p className="text-sm">
                <CoinText>
                  This cheque is locked to{" "}
                  <span className="font-semibold">
                    {cheque.recipient.name} ({cheque.recipient.handle})
                  </span>
                  . Cashing sends the NIM straight to their wallet.
                </CoinText>
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-semibold">
                <CoinText>Where should the NIM go?</CoinText>
              </p>
              {defaultMyAddress && !rawDest && (
                <div className="flex items-center justify-between gap-3 border border-ink bg-subtle p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted">Your connected wallet</p>
                    <p className="truncate font-semibold">
                      {me?.name ? `${me.name}${me.tag ? ` · ${formatTag(me.tag)}` : ""}` : shortAddress(defaultMyAddress)}
                    </p>
                    <p className="font-mono text-xs text-muted">{shortAddress(defaultMyAddress)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-semibold">✓ READY</span>
                </div>
              )}
              <Field
                label={defaultMyAddress ? "Or send to another tag or NQ address" : "Your NimBill tag or Nimiq address"}
                htmlFor="cash-dest"
                optional={!!defaultMyAddress}
              >
                <Input
                  id="cash-dest"
                  mono
                  value={destInput}
                  onChange={(e) => setDestInput(e.target.value)}
                  placeholder="ada@nimbill or NQ42 …"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </Field>
              {maybeTag && !tagInvalid && tagLookup?.tag === maybeTag && tagLookup.owner && (
                <div className="flex items-center gap-3 border border-ink p-3">
                  <Avatar src={tagLookup.owner.avatarUrl} name={tagLookup.owner.name} className="w-10 text-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{tagLookup.owner.name}</p>
                    <p className="font-mono text-xs text-muted">{shortAddress(tagLookup.owner.address)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-semibold">✓ TAG</span>
                </div>
              )}
              {maybeTag && (tagInvalid || (tagLookup?.tag === maybeTag && tagLookup.error)) && (
                <p className="text-xs font-medium">✕ {tagInvalid ?? tagLookup?.error}</p>
              )}
              {!me?.name && !tagLookup?.owner && (
                <Field label="Your name" htmlFor="claimer-name" optional hint="Shown to the person who wrote the cheque.">
                  <Input
                    id="claimer-name"
                    value={claimerName}
                    onChange={(e) => setClaimerName(e.target.value)}
                    placeholder="Tunde Bello"
                    maxLength={80}
                  />
                </Field>
              )}
            </div>
          )}

          {actionError && <Alert kind="error">{actionError}</Alert>}

          <Button size="lg" block loading={busy === "cash"} disabled={!resolvedRecipient || !!busy} onClick={() => void runAction("cash")}>
            Cash {displayAmount} →
          </Button>
          <p className="text-center text-xs text-muted">
            <CoinText>Moves {formatAsset(cheque.amount, "NIM")} from this cheque straight into the wallet on-chain.</CoinText>
          </p>
        </Card>
      )}

      {cheque.status === "funded" && secret && cheque.isWriter && (
        <>
          <WriterShareCard cheque={cheque} secret={secret} />
          {cheque.htlc && !cheque.htlc.contractAddress && (
            <Card tone="subtle" className="space-y-2">
              <p className="text-xs font-semibold">Finish activating 30-day HTLC timeout protection</p>
              <p className="text-xs text-muted">
                Lock this cheque inside its Nimiq HTLC contract so that after {htlcTimeoutDate ?? "30 days"} you can reclaim the NIM on-chain even if NimBill is unreachable.
              </p>
              <Button variant="secondary" size="sm" block loading={busy === "lock"} disabled={!!busy} onClick={() => void runHtlcLock()}>
                Activate HTLC timeout lock
              </Button>
            </Card>
          )}
          <Card className="space-y-3">
            <p className="text-sm font-semibold">Changed your mind?</p>
            <p className="text-xs text-muted">
              <CoinText>
                Cancel this cheque before it&apos;s cashed to sweep the {formatAsset(cheque.amount, "NIM")} back into your wallet.
                {cheque.htlc?.contractAddress && htlcTimeoutDate && (
                  <>
                    {" "}Protected by a Nimiq HTLC contract ({shortAddress(cheque.htlc.contractAddress)}): after {htlcTimeoutDate}, you can also reclaim directly on-chain without NimBill, using this cheque&apos;s refund key.
                  </>
                )}
              </CoinText>
            </p>
            {cheque.htlc && refundSecret && (
              <div className="flex items-center justify-between gap-3 border border-line p-2">
                <p className="text-xs text-muted">Refund key: only you have it. Keep a copy, never share it.</p>
                <CopyButton text={refundSecret} label="Copy refund key" variant="secondary" size="sm" className="shrink-0" />
              </div>
            )}
            {actionError && <Alert kind="error">{actionError}</Alert>}
            {reclaimTxHash && (
              <Alert kind="info">
                Direct on-chain HTLC timeout refund broadcast.{" "}
                <a href={nimExplorerTx(reclaimTxHash)} target="_blank" rel="noreferrer" className="underline">
                  View transaction ↗
                </a>
              </Alert>
            )}
            <Button variant="danger" block loading={busy === "cancel"} disabled={!!busy} onClick={() => void runAction("cancel")}>
              Cancel &amp; take back {displayAmount}
            </Button>
            {cheque.htlc?.contractAddress && htlcExpired && (
              <Button variant="secondary" block loading={busy === "reclaim"} disabled={!!busy} onClick={() => void runDirectReclaim()}>
                Reclaim directly on-chain (no server)
              </Button>
            )}
          </Card>
        </>
      )}

      <p className="text-center text-xs text-muted">
        Non-custodial: NimBill never holds the key to this cheque
        {cheque.htlc?.timeoutAt ? `, and an on-chain HTLC refunds the writer after ${htlcTimeoutDate}` : ""}.{" "}
        <TextLink href="/cheques" muted>
          Write a cheque
        </TextLink>
      </p>
    </div>
  );
}

export function WriterShareCard({ cheque, secret }: { cheque: PublicCheque; secret: string }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const [showQr, setShowQr] = useState(false);
  const path = `/c/${cheque.id}#${secret}`;
  const url = origin ? `${origin}${path}` : path;
  const code = formatChequeCode(cheque.id, secret);
  const amount = cheque.currency === "NIM" ? formatAsset(cheque.amount, "NIM") : formatFiat(cheque.fiatAmount, cheque.currency);

  return (
    <Card tone="strong" className="space-y-3">
      <div>
        <p className="font-semibold">Hand over this cheque</p>
        <p className="text-xs text-muted">
          {cheque.recipient.kind === "tag"
            ? `Only ${cheque.recipient.handle} can cash it.`
            : "Treat this link like cash — the first person to open it can claim the money."}
        </p>
        <p className="mt-1 text-xs font-medium">
          This link and code are the only key to the cheque. NimBill can&apos;t recover them, so keep a copy (you need it to cancel).
        </p>
      </div>
      <CodeBlock className="text-xs">{url}</CodeBlock>
      <div className="grid grid-cols-3 gap-2">
        {canShare ? (
          <Button
            size="sm"
            className="min-h-11"
            onClick={() => navigator.share({ url, text: `NimBill cheque for ${amount}` }).catch(() => {})}
          >
            Share link
          </Button>
        ) : (
          <CopyButton text={url} label="Copy link" variant="primary" size="sm" className="min-h-11" />
        )}
        <Button variant="secondary" size="sm" className="min-h-11" aria-pressed={showQr} onClick={() => setShowQr(!showQr)}>
          {showQr ? "Hide QR" : "QR code"}
        </Button>
        <CopyButton text={code} label="Copy code" variant="secondary" size="sm" className="min-h-11" />
      </div>
      {showQr && (
        <div className="flex flex-col items-center gap-2 border border-line bg-paper p-4">
          <QRCodeSVG value={url} size={180} level="M" />
          <p className="font-mono text-[11px] text-muted">{cheque.number}</p>
        </div>
      )}
    </Card>
  );
}
