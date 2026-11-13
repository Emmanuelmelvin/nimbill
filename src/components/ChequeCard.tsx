import { Avatar } from "@/components/Avatar";
import { Badge, type BadgeVariant, LogoMark } from "@/components/ui";
import type { PublicCheque } from "@/lib/cheques";
import { formatAsset, formatFiat } from "@/lib/currencies";
import { shortAddress } from "@/lib/nimiq-address";

const STATUS_LABEL: Record<PublicCheque["status"], { text: string; variant: BadgeVariant }> = {
  pending: { text: "UNFUNDED", variant: "muted" },
  funded: { text: "FUNDED", variant: "solid" },
  settling: { text: "CASHING…", variant: "outline" },
  cashed: { text: "CASHED ✓", variant: "outline" },
  cancelled: { text: "CANCELLED", variant: "muted" },
};

/**
 * A NimBill cheque drawn in the sharp black-and-white style: who it's for (a specific @tag or
 * anyone first to claim), the amount, the note, who signed it, and its on-chain status.
 */
export function ChequeCard({ cheque }: { cheque: PublicCheque }) {
  const isFiat = cheque.currency !== "NIM";
  const mainAmount = isFiat ? formatFiat(cheque.fiatAmount, cheque.currency) : formatAsset(cheque.amount, "NIM");
  const status = STATUS_LABEL[cheque.status];

  return (
    <figure aria-label={`NimBill cheque ${cheque.number}`} className="relative">
      <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 border border-ink bg-subtle" />
      <div className="relative border border-ink bg-paper p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-edge pb-3">
          <span className="flex items-center gap-2">
            <LogoMark size={20} />
            <span className="font-bold tracking-tighter">NimBill cheque</span>
          </span>
          <span className="font-mono text-[10px] tracking-wider text-muted">NO. {cheque.number}</span>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Pay to the order of</p>
            {cheque.recipient.kind === "tag" ? (
              <div className="mt-1 flex items-center gap-2 border-b border-ink pb-1">
                <Avatar src={cheque.recipient.avatarUrl} name={cheque.recipient.name} className="w-5 text-xs" />
                <p className="truncate font-semibold">
                  {cheque.recipient.name} <span className="font-mono text-xs font-normal text-muted">· {cheque.recipient.handle}</span>
                </p>
              </div>
            ) : (
              <p className="mt-1 truncate border-b border-ink pb-1 font-semibold">
                Anyone <span className="text-xs font-normal text-muted">· first to claim</span>
              </p>
            )}
          </div>
          <div className="border-2 border-ink px-3 py-1.5 text-right">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Amount</p>
            <p className="font-mono text-lg font-bold tabular-nums">{mainAmount}</p>
          </div>
        </div>

        {isFiat && (
          <p className="mt-2 border-b border-line pb-1 font-mono text-xs text-muted">{formatAsset(cheque.amount, "NIM")} locked inside</p>
        )}

        <div className="mt-4 grid grid-cols-2 items-end gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">For</p>
            <p className="truncate text-sm">{cheque.note || "—"}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="truncate border-b border-ink pb-0.5 font-serif text-base italic">{cheque.writer.name}</p>
            <p className="mt-1 truncate font-mono text-[10px] tracking-wider text-muted uppercase">
              {cheque.writer.handle ?? "Signed in Nimiq Pay"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 pt-1 font-mono text-[10px] tracking-wider text-muted">
          <span className="truncate">⑆ {shortAddress(cheque.chequeAddress)} ⑈</span>
          <Badge variant={status.variant}>{status.text}</Badge>
        </div>
      </div>
    </figure>
  );
}
