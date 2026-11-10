"use client";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { InvoiceDoc } from "@/components/InvoiceDoc";
import { PayPanel } from "@/components/PayPanel";
import { StakeCard } from "@/components/StakeCard";
import { CopyButton, Header, Notice, Spinner, useCanShare, useOrigin } from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { nimExplorerTx, openInNimiqPayLink, polygonExplorerTx } from "@/lib/client/nimiq";
import { useSession } from "@/lib/client/session";
import { formatAsset, formatFiat } from "@/lib/currencies";

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
  const [error, setError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = useCallback(() => {
    api<{ invoice: PublicInvoice; isOwner: boolean }>(`/api/invoices/${id}`)
      .then((r) => {
        setError(null);
        setInv(r.invoice);
        setIsOwner(r.isOwner);
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
        <Notice kind="error">{error}</Notice>
        <button className="btn-ghost mt-4 w-full" onClick={load}>
          Try again
        </button>
      </>
    );
  }
  if (!inv) {
    return (
      <>
        <Header back="/" />
        <div className="flex justify-center py-24 text-navy">
          <Spinner />
        </div>
      </>
    );
  }

  const ownerView = isOwner && !preview;

  return (
    <>
      <Header back={isOwner ? "/" : undefined} />
      <div className="space-y-4">
        {inv.isDemo && (
          <Notice kind="warn">
            <b>Sample invoice.</b> Pay it to see the whole flow: rate lock → wallet → on-chain verification → receipt. It costs about $0.05 in NIM.
          </Notice>
        )}
        {created && ownerView && inv.status === "unpaid" && <Notice kind="success">Invoice created. Send the link to your client.</Notice>}

        {inv.status === "paid" && inv.payment && <PaidBanner inv={inv} fresh={justPaid} isOwner={isOwner} />}

        <InvoiceDoc inv={inv} />

        {inv.status === "unpaid" && ownerView && <SharePanel inv={inv} onCancelled={setInv} />}
        {inv.status === "unpaid" && !ownerView && <PayPanel inv={inv} onPaid={onPaid} selfPreview={isOwner} />}
        {isOwner && inv.status === "unpaid" && (
          <button className="w-full py-2 text-sm text-muted underline" onClick={() => setPreview((p) => !p)}>
            {preview ? "Back to my view" : "Preview as client"}
          </button>
        )}
        {inv.status === "cancelled" && <Notice>This invoice was cancelled by {inv.merchantName}. No payment is due.</Notice>}

        {isOwner && inv.status === "paid" && inv.payment?.asset === "NIM" && (
          <StakeCard suggestedLuna={Number(inv.payment.amount)} title="Stake what you just earned" />
        )}

        {!merchant && !inv.isDemo && (
          <p className="pt-2 text-center text-sm text-muted">
            Freelancer?{" "}
            <Link href="/" className="font-semibold text-navy underline">
              Send your own invoices with NimBill
            </Link>
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
    <section className={`card border-2 border-ok/30 text-center ${fresh ? "animate-[pop_.4s_ease-out]" : ""}`}>
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok text-3xl text-white">✓</div>
      <h2 className="mt-3 text-xl font-bold">{fresh ? "Payment confirmed!" : isOwner ? "You've been paid" : "Paid"}</h2>
      <p className="mt-1 text-muted">
        {formatAsset(p.amount, p.asset as "NIM" | "USDT")} for {formatFiat(inv.total, inv.currency)} · {new Date(p.paidAt).toLocaleString()}
      </p>
      <p className="mt-1 text-xs text-muted">Verified on the {p.asset === "NIM" ? "Nimiq" : "Polygon"} blockchain</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link href={`/i/${inv.id}/receipt`} className="btn-dark text-sm">
          View receipt
        </Link>
        <a href={explorer} target="_blank" rel="noreferrer" className="btn-ghost text-sm">
          On-chain proof ↗
        </a>
      </div>
    </section>
  );
}

function SharePanel({ inv, onCancelled }: { inv: PublicInvoice; onCancelled: (i: PublicInvoice) => void }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const url = origin ? `${origin}/i/${inv.id}` : "";
  const [showQr, setShowQr] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nimiqPayUrl = url ? openInNimiqPayLink(url) : "";
  const shareText = `Invoice ${inv.number} from ${inv.merchantName}: ${formatFiat(inv.total, inv.currency)}. Pay with NIM${inv.acceptsUsdt ? " or USDT" : ""}:`;

  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">Get paid</h2>
      <p className="text-sm text-muted">Send this link to {inv.clientName}. It opens the invoice in Nimiq Pay, where they can pay in a few taps.</p>
      <div className="rounded-xl bg-surface p-3 font-mono text-xs break-all">{nimiqPayUrl || "…"}</div>
      <div className="grid grid-cols-2 gap-2">
        {canShare ? (
          <button className="btn-primary" onClick={() => navigator.share({ title: `Invoice ${inv.number}`, text: shareText, url: nimiqPayUrl }).catch(() => {})}>
            Share
          </button>
        ) : (
          <a className="btn-primary" href={`https://wa.me/?text=${encodeURIComponent(`${shareText} ${nimiqPayUrl}`)}`} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        )}
        <CopyButton text={nimiqPayUrl} label="Copy link" />
      </div>
      <button className="btn-ghost w-full" onClick={() => setShowQr((s) => !s)}>
        {showQr ? "Hide QR code" : "Show QR code (in person)"}
      </button>
      {showQr && nimiqPayUrl && (
        <div className="flex flex-col items-center gap-2 py-2">
          <QRCodeSVG value={nimiqPayUrl} size={220} level="M" />
          <p className="text-xs text-muted">Client scans with their phone camera</p>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer py-2 text-muted">More options</summary>
        <div className="space-y-2 pt-2">
          <CopyButton text={url} label="Copy plain web link" className="btn-ghost w-full text-sm" />
          <button
            className="btn-ghost w-full text-sm text-bad"
            disabled={cancelling}
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
          </button>
          {error && <Notice kind="error">{error}</Notice>}
        </div>
      </details>
    </section>
  );
}
