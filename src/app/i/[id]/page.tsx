"use client";
import { QRCodeSVG } from "qrcode.react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { InvoiceDoc } from "@/components/InvoiceDoc";
import { RemindActions, ViewedStatus, daysOverdue } from "@/components/InvoiceReminder";
import { PayPanel } from "@/components/PayPanel";
import { StakeCard } from "@/components/StakeCard";
import {
  Alert,
  AnchorButton,
  Button,
  Card,
  CardHeader,
  CodeBlock,
  CoinAmount,
  CopyButton,
  Disclosure,
  Header,
  LinkButton,
  Loader,
  TextButton,
  TextLink,
  cx,
  useCanShare,
  useOrigin,
} from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { nimExplorerTx, openInNimiqPayLink, polygonExplorerTx } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { formatFiat } from "@/lib/currencies";

export default function InvoicePage() {
  return (
    <Suspense fallback={<Header />}>
      <InvoiceScreen />
    </Suspense>
  );
}

function InvoiceScreen() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created") === "1";
  const { merchant } = useSession();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [viewedAt, setViewedAt] = useState<string | null>(null);
  const [clientEmail, setClientEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => {
    // view=1: this is the invoice page, so a visit by anyone but the owner marks it "Viewed".
    api<{ invoice: PublicInvoice; isOwner: boolean; viewedAt: string | null; clientEmail: string | null }>(`/api/invoices/${id}?view=1`)
      .then((r) => {
        setError(null);
        setInv(r.invoice);
        setIsOwner(r.isOwner);
        setViewedAt(r.viewedAt);
        setClientEmail(r.clientEmail);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load, merchant?.address]);

  // Owners watching an unpaid invoice see it flip to paid without refreshing.
  useEffect(() => {
    if (!inv || inv.status !== "unpaid" || !isOwner) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [inv, isOwner, load]);

  const onPaid = useCallback((p: PublicInvoice) => {
    setInv(p);
    setJustPaid(true);
  }, []);

  if (error) {
    return (
      <>
        <Header back="/" />
        <Alert kind="error">{error}</Alert>
        <Button variant="secondary" block className="mt-4" onClick={load}>
          Try again
        </Button>
      </>
    );
  }
  if (!inv) {
    return (
      <>
        <Header back="/" />
        <Loader />
      </>
    );
  }

  const ownerView = isOwner && !preview;

  return (
    <>
      <Header back={isOwner ? "/invoices" : undefined} />
      <div className="space-y-4">
        {inv.isDemo && (
          <Alert kind="warn" title="Sample invoice">
            Pay it to see the whole flow: rate lock → wallet → on-chain verification → receipt. It costs about $0.05 in NIM.
          </Alert>
        )}
        {created && ownerView && inv.status === "unpaid" && (
          <Alert kind="success">Invoice created. Send the link or the Nimbill number to your client.</Alert>
        )}

        {inv.status === "paid" && inv.payment && <PaidBanner inv={inv} fresh={justPaid} isOwner={isOwner} />}

        <InvoiceDoc inv={inv} />

        {inv.status === "unpaid" && ownerView && (
          <SharePanel inv={inv} viewedAt={viewedAt} clientEmail={clientEmail} onCancelled={setInv} />
        )}
        {inv.status === "unpaid" && !ownerView && <PayPanel inv={inv} onPaid={onPaid} selfPreview={isOwner} />}
        {isOwner && inv.status === "unpaid" && (
          <TextButton className="w-full" onClick={() => setPreview((p) => !p)}>
            {preview ? "Back to my view" : "Preview as client"}
          </TextButton>
        )}
        {isOwner && !inv.isDemo && !preview && (
          <LinkButton href={`/new?from=${inv.id}`} variant="secondary" block>
            Duplicate this invoice
          </LinkButton>
        )}
        {inv.status === "cancelled" && <Alert>This invoice was cancelled by {inv.merchantName}. No payment is due.</Alert>}

        {isOwner && inv.status === "paid" && inv.payment?.asset === "NIM" && (
          <StakeCard suggestedLuna={Number(inv.payment.amount)} title="Stake what you just earned" />
        )}

        {!merchant && !inv.isDemo && (
          <p className="pt-2 text-center text-sm text-muted">
            Freelancer? <TextLink href="/">Send your own invoices with NimBill</TextLink>
          </p>
        )}
      </div>
    </>
  );
}

function PaidBanner({ inv, fresh, isOwner }: { inv: PublicInvoice; fresh: boolean; isOwner: boolean }) {
  const p = inv.payment!;
  const explorer = p.asset === "NIM" ? nimExplorerTx(p.txHash) : polygonExplorerTx(p.txHash);
  return (
    <Card tone="strong" className={cx("text-center", fresh && "animate-[pop_.4s_ease-out]")}>
      <div aria-hidden className="mx-auto flex h-14 w-14 items-center justify-center bg-ink text-3xl text-paper">
        ✓
      </div>
      <h2 className="mt-3 text-xl font-bold">{fresh ? "Payment confirmed!" : isOwner ? "You've been paid" : "Paid"}</h2>
      <p className="mt-1 text-muted">
        <CoinAmount units={p.amount} asset={p.asset as "NIM" | "USDT"} /> for {formatFiat(inv.total, inv.currency)}
        {Number(p.tip) > 0 && ` + ${formatFiat(p.tip!, inv.currency)} tip`} · {new Date(p.paidAt).toLocaleString()}
      </p>
      <p className="mt-1 font-mono text-[11px] tracking-wider text-muted uppercase">
        Verified on the {p.asset === "NIM" ? "Nimiq" : "Polygon"} blockchain
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <LinkButton href={`/i/${inv.id}/receipt`} size="sm" className="min-h-11">
          View receipt
        </LinkButton>
        <AnchorButton href={explorer} target="_blank" rel="noreferrer" variant="secondary" size="sm" className="min-h-11">
          On-chain proof ↗
        </AnchorButton>
        {/* "Pay with NimBill": back to the store that sent the payer here (its address is checked server-side). */}
        {inv.returnUrl && !isOwner && (
          <AnchorButton href={inv.returnUrl} size="md" className="col-span-2 min-h-11">
            Back to {new URL(inv.returnUrl).host} →
          </AnchorButton>
        )}
      </div>
    </Card>
  );
}

function SharePanel({
  inv,
  viewedAt,
  clientEmail,
  onCancelled,
}: {
  inv: PublicInvoice;
  viewedAt: string | null;
  clientEmail: string | null;
  onCancelled: (i: PublicInvoice) => void;
}) {
  const late = daysOverdue(inv);
  const origin = useOrigin();
  const canShare = useCanShare();
  const url = origin ? `${origin}/i/${inv.id}` : "";
  const [showQr, setShowQr] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nimiqPayUrl = url ? openInNimiqPayLink(url) : "";
  const shareText = `Invoice ${inv.number} from ${inv.merchantName}: ${formatFiat(inv.total, inv.currency)}. Pay with NIM${inv.acceptsUsdt ? " or USDT" : ""}:`;

  return (
    <Card className="space-y-3">
      <CardHeader
        title="Get paid"
        description={`Send this link to ${inv.clientName}. It opens the invoice in Nimiq Pay, where they can pay in a few taps.`}
      />
      <ViewedStatus viewedAt={viewedAt} />
      {/* Overdue: the reminder comes first, it's the one thing to do now. */}
      {late > 0 && (
        <div className="space-y-2 border border-ink p-3">
          <div>
            <h3 className="font-bold">Overdue by {late === 1 ? "1 day" : `${late} days`}</h3>
            <p className="mt-1 text-sm text-muted">Send {inv.clientName} a friendly reminder with the payment link.</p>
          </div>
          <RemindActions inv={inv} clientEmail={clientEmail} />
        </div>
      )}
      <CodeBlock>{nimiqPayUrl || "…"}</CodeBlock>
      <div className="grid grid-cols-2 gap-2">
        {canShare ? (
          <Button onClick={() => navigator.share({ title: `Invoice ${inv.number}`, text: shareText, url: nimiqPayUrl }).catch(() => {})}>
            Share
          </Button>
        ) : (
          <AnchorButton href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${nimiqPayUrl}`)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </AnchorButton>
        )}
        <CopyButton text={nimiqPayUrl} label="Copy link" />
      </div>
      <Button variant="secondary" block onClick={() => setShowQr((s) => !s)}>
        {showQr ? "Hide QR code" : "Show QR code (in person)"}
      </Button>
      {showQr && nimiqPayUrl && (
        <div className="flex flex-col items-center gap-2 border border-line py-4">
          <QRCodeSVG value={nimiqPayUrl} size={220} level="M" />
          <p className="text-xs text-muted">Client scans with their phone camera</p>
        </div>
      )}
      <div className="space-y-2 border-t border-line pt-3">
        <div>
          <h3 className="font-bold">Or send just the Nimbill number</h3>
          <p className="mt-1 text-sm text-muted">
            No link needed. {inv.clientName} opens NimBill in Nimiq Pay, pastes this number under &ldquo;Pay an invoice&rdquo; and pays.
          </p>
        </div>
        <CodeBlock className="text-center text-lg font-bold tracking-wider break-normal">{inv.nimbillNumber}</CodeBlock>
        <CopyButton text={inv.nimbillNumber} label="Copy Nimbill number" block />
      </div>
      <Disclosure summary="More options">
        {late === 0 && (
          <div className="space-y-2 pb-1">
            <p className="text-sm font-semibold">Send a reminder</p>
            <RemindActions inv={inv} clientEmail={clientEmail} size="sm" />
          </div>
        )}
        <CopyButton text={url} label="Copy plain web link" size="sm" block className="min-h-11" />
        <Button
          variant="danger"
          size="sm"
          block
          className="min-h-11"
          loading={cancelling}
          onClick={async () => {
            if (!confirm("Cancel this invoice? Your client will no longer be able to pay it.")) return;
            setCancelling(true);
            try {
              const r = await api<{ invoice: PublicInvoice }>(`/api/invoices/${inv.id}`, { method: "DELETE" });
              onCancelled(r.invoice);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setCancelling(false);
            }
          }}
        >
          Cancel invoice
        </Button>
        {error && <Alert kind="error">{error}</Alert>}
      </Disclosure>
    </Card>
  );
}
