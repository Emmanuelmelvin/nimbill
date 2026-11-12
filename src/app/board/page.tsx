"use client";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { BoardPage } from "@/components/BoardPage";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  CodeBlock,
  CopyButton,
  Eyebrow,
  Field,
  LinkButton,
  Stat,
  Textarea,
  useCanShare,
  useOrigin,
} from "@/components/ui";
import { api, type MerchantInfo } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { boardPath } from "@/lib/board";
import { formatMoney, type Fx } from "@/lib/money";
import { formatTag } from "@/lib/tags";

type Summary = { last30: { orders: number; usd: number }; liveProducts: number; fx: Fx | null; currency: string };

/** The board's numbers; null while loading, or if they couldn't be loaded. */
function useBoardSummary() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    api<Summary>("/api/board")
      .then(setS)
      .catch(() => {});
  }, []);
  return s;
}

export default function Board() {
  return (
    <BoardPage title="My link" description="A public page where anyone can pay you, no account needed.">
      <MyLink />
    </BoardPage>
  );
}

function MyLink() {
  const { merchant } = useSession();
  const summary = useBoardSummary();
  if (!merchant) return null;
  if (!merchant.tag) {
    return (
      <Card tone="strong" className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Claim your tag first</p>
          <p className="text-sm text-muted">Your board lives at your tag, like nimbill/pay/ada.</p>
        </div>
        <LinkButton href="/settings#tag" size="sm" className="shrink-0">
          Claim tag
        </LinkButton>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <LinkCard merchant={merchant as MerchantInfo & { tag: string }} liveProducts={summary?.liveProducts ?? null} />
      <Last30 s={summary} />
      <BoardSettings merchant={merchant} />
    </div>
  );
}

/** The link itself, ready to share, with the board's settings at a glance. */
function LinkCard({ merchant, liveProducts }: { merchant: MerchantInfo & { tag: string }; liveProducts: number | null }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const [qr, setQr] = useState(false);
  const url = `${origin}${boardPath(merchant.tag)}`;
  const chips = [
    "NIM",
    ...(merchant.evmAddress ? ["USDT"] : []),
    merchant.boardOpenAmounts ? "Open amounts on" : "Open amounts off",
    ...(liveProducts !== null ? [`${liveProducts} ${liveProducts === 1 ? "product" : "products"}`] : []),
  ];

  return (
    <Card tone="strong" padding="none">
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div className="min-w-0">
          <Eyebrow>Board</Eyebrow>
          <p className="mt-0.5 truncate font-semibold">{formatTag(merchant.tag)}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-ink px-2 py-0.5 font-mono text-[11px] font-semibold">
          <span aria-hidden className="blink h-1.5 w-1.5 bg-ink" />
          LIVE
        </span>
      </div>

      <div className="space-y-3 p-4">
        <CodeBlock className="text-sm">{url || boardPath(merchant.tag)}</CodeBlock>
        <div className="grid grid-cols-3 gap-2">
          {canShare ? (
            <Button size="sm" className="min-h-11" onClick={() => navigator.share({ url, text: `Pay me on NimBill` }).catch(() => {})}>
              Share
            </Button>
          ) : (
            <CopyButton text={url} label="Copy" variant="primary" size="sm" className="min-h-11" />
          )}
          <Button variant="secondary" size="sm" className="min-h-11" aria-pressed={qr} onClick={() => setQr(!qr)}>
            {qr ? "Hide QR" : "QR code"}
          </Button>
          <LinkButton href={boardPath(merchant.tag)} variant="secondary" size="sm" className="min-h-11">
            Preview
          </LinkButton>
        </div>
        {qr && (
          <div className="flex justify-center border border-line bg-paper p-4">
            <QRCodeSVG value={url} size={180} level="M" />
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-2 border-t border-line p-4">
        {chips.map((c) => (
          <li key={c} className="border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
            {c}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Last30({ s }: { s: Summary | null }) {
  const money = (usd: number) => (s ? formatMoney(usd, s.currency, s.fx, { whole: true }) : "—");
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Via board · 30D" value={money(s?.last30.usd ?? 0)} />
      <Stat label="Orders · 30D" value={s ? String(s.last30.orders) : "—"} />
    </div>
  );
}

/** What visitors see on the board, and what they may do there. Saved to the profile. */
function BoardSettings({ merchant }: { merchant: MerchantInfo }) {
  const { setMerchant } = useSession();
  const [bio, setBio] = useState(merchant.bio ?? "");
  const [open, setOpen] = useState(merchant.boardOpenAmounts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const changed = bio.trim() !== (merchant.bio ?? "") || open !== merchant.boardOpenAmounts;

  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          setSaved(false);
          try {
            const r = await api<{ merchant: MerchantInfo }>("/api/me", { body: { bio: bio.trim(), boardOpenAmounts: open } });
            setMerchant(r.merchant);
            setSaved(true);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Bio" htmlFor="bio" optional hint="One line under your name on the board, like what you do and where.">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setSaved(false);
            }}
            placeholder="Brand designer, Lagos"
            maxLength={160}
            className="min-h-20"
          />
        </Field>
        <Checkbox
          label="Accept open payments"
          description="Visitors can type their own amount and what it's for. Turn it off to sell only your products."
          checked={open}
          onChange={(e) => {
            setOpen(e.target.checked);
            setSaved(false);
          }}
        />
        {error && <Alert kind="error">{error}</Alert>}
        {saved && <Alert kind="success">Saved.</Alert>}
        <Button type="submit" variant="secondary" block loading={busy} disabled={!changed}>
          Save board settings
        </Button>
      </form>
    </Card>
  );
}
