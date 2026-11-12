"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CurrencySelect } from "@/components/CurrencySelect";
import { ProductImage } from "@/components/ProductImage";
import { Alert, Button, CopyButton, Field, Input, Loader, LogoMark, SegmentedControl, TextLink, cx, useHref } from "@/components/ui";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useSession } from "@/lib/client/session";
import { formatFiat } from "@/lib/currencies";
import { AppError } from "@/lib/errors";
import type { PublicBoard } from "@/lib/board-server";

type Tab = "pay" | "products";

/** A merchant's public pay page: pay any amount, or buy one of their products. No account needed. */
export default function PayBoard() {
  const { tag } = useParams<{ tag: string }>();
  const [board, setBoard] = useState<PublicBoard | null>(null);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);
  useEffect(() => {
    api<PublicBoard>(`/api/pay/${encodeURIComponent(decodeURIComponent(tag))}`)
      .then(setBoard)
      .catch((e) => setError({ notFound: AppError.is(e) && e.code === "NOT_FOUND", message: (e as Error).message }));
  }, [tag]);

  return (
    <div className="pt-6">
      <Link href="/" className="mx-auto flex w-max items-center gap-2 text-ink" aria-label="NimBill home">
        <LogoMark size={24} />
        <span className="font-bold tracking-tighter">NimBill</span>
      </Link>
      <div className="mt-6">
        {error ? (
          <div className="border border-ink p-6 text-center">
            <p className="text-lg font-bold">{error.notFound ? "No board here" : "Couldn't load this board"}</p>
            <p className="mt-1 text-sm text-muted">
              {error.notFound ? "No one has that tag. Check the link you were sent." : error.message}
            </p>
          </div>
        ) : board ? (
          <Board board={board} />
        ) : (
          <Loader />
        )}
      </div>
    </div>
  );
}

function Board({ board }: { board: PublicBoard }) {
  const { merchant, products } = board;
  const { merchant: me } = useSession();
  const href = useHref();
  const own = me?.address === merchant.address;
  const tabs = [
    ...(merchant.openAmounts ? [{ value: "pay" as Tab, label: `Pay ${merchant.name.split(" ")[0]}` }] : []),
    ...(products.length ? [{ value: "products" as Tab, label: `Products · ${products.length}` }] : []),
  ];
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? "pay");

  return (
    <div className="space-y-4">
      {own && <Alert kind="info">This is how visitors see your board. You can&apos;t pay yourself here.</Alert>}

      <section className="border border-ink bg-paper">
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Pay link</span>
            <span className="inline-flex items-center gap-1.5 border border-ink px-2 py-0.5 font-mono text-[11px] font-semibold">
              <span aria-hidden className="h-1.5 w-1.5 bg-ink" />
              NIM{merchant.acceptsUsdt && " · USDT"}
            </span>
          </div>
          <p className="mt-5 text-sm text-muted">To</p>
          <h1 className="text-2xl leading-tight font-bold tracking-tight break-words">{merchant.handle}</h1>
          <p className="mt-1 text-sm text-muted">
            {merchant.name}
            {merchant.bio && ` · ${merchant.bio}`}
          </p>
          {tabs.length > 1 && (
            <div className="mt-5">
              <SegmentedControl label="What to pay" options={tabs} value={tab} onChange={setTab} block />
            </div>
          )}
        </div>

        {tabs.length === 0 ? (
          <p className="border-t border-dashed border-edge bg-subtle p-5 text-sm text-muted">
            {merchant.name} isn&apos;t taking payments here right now.
          </p>
        ) : tab === "pay" ? (
          <OpenAmount board={board} own={own} />
        ) : (
          <ProductPicker board={board} own={own} />
        )}
      </section>

      <div className="flex justify-center">
        <CopyButton text={href} label="Copy link" size="sm" />
      </div>
      <p className="text-center text-xs text-muted">Paid wallet to wallet and checked on the blockchain. NimBill never holds the money.</p>
      <p className="text-center text-xs text-muted">
        New to NimBill?{" "}
        <TextLink href="/" muted>
          See how it works
        </TextLink>
      </p>
      <p className="text-center text-xs text-muted">
        Paying from a program or AI agent?{" "}
        <TextLink href="/docs" muted>
          Use the API
        </TextLink>
      </p>
    </div>
  );
}

/** Starts the invoice on the server, then opens it to pay like any other invoice. */
function useStartPayment(tag: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const { invoice } = await api<{ invoice: PublicInvoice }>(`/api/pay/${tag}/invoices`, { body });
      router.push(`/i/${invoice.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return { start, busy, error };
}

/** How many to buy: − and + buttons around the number (1 to 100, the most one invoice allows). */
function QuantityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const step =
    "flex h-11 w-11 items-center justify-center font-mono text-lg transition-colors hover:bg-subtle disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex items-center justify-between gap-3">
      <span id="qty-label" className="text-sm font-medium">
        Quantity
      </span>
      <div role="group" aria-labelledby="qty-label" className="flex items-center border border-ink">
        <button type="button" className={step} aria-label="One fewer" disabled={value <= 1} onClick={() => onChange(value - 1)}>
          −
        </button>
        <output aria-live="polite" className="w-10 border-x border-ink text-center font-mono leading-[2.75rem] font-semibold tabular-nums">
          {value}
        </output>
        <button type="button" className={step} aria-label="One more" disabled={value >= 100} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

/** The part of the card under the tear line: the total and the button. */
function Stub({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3 border-t border-dashed border-edge bg-subtle p-5">{children}</div>;
}

function OpenAmount({ board, own }: { board: PublicBoard; own: boolean }) {
  const { start, busy, error } = useStartPayment(board.merchant.tag);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(board.products[0]?.currency ?? "USD");
  const [description, setDescription] = useState("");
  const [payerName, setPayerName] = useState("");
  const value = Number(amount);
  const ready = value > 0 && description.trim() !== "" && payerName.trim() !== "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !own) void start({ amount: value, currency, description: description.trim(), payerName: payerName.trim() });
      }}
    >
      <div className="space-y-4 px-5 pb-5">
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <Field label="Amount" htmlFor="pay-amount">
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              className="text-lg font-bold tabular-nums"
            />
          </Field>
          <div className="w-36">
            <CurrencySelect value={currency} onChange={setCurrency} />
          </div>
        </div>
        <Field label="What's it for?" htmlFor="pay-for">
          <Input
            id="pay-for"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Logo design deposit"
            maxLength={120}
          />
        </Field>
        <Field label="Your name" htmlFor="pay-name" hint="So they know who paid.">
          <Input
            id="pay-name"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Tunde Bello"
            maxLength={80}
            autoComplete="name"
          />
        </Field>
      </div>
      <Stub>
        {value > 0 && (
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[11px] tracking-wider text-muted uppercase">You pay</span>
            <span className="text-xl font-bold tabular-nums">{formatFiat(value, currency)}</span>
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" block loading={busy} disabled={!ready || own}>
          Continue to pay →
        </Button>
        <p className="text-center text-xs text-muted">
          Next you pick NIM{board.merchant.acceptsUsdt && " or USDT"}. The price is locked for 5 minutes.
        </p>
      </Stub>
    </form>
  );
}

function ProductPicker({ board, own }: { board: PublicBoard; own: boolean }) {
  const { start, busy, error } = useStartPayment(board.merchant.tag);
  const [picked, setPicked] = useState<string | null>(board.products.length === 1 ? board.products[0].id : null);
  const [quantity, setQuantity] = useState(1);
  const [payerName, setPayerName] = useState("");
  const product = board.products.find((p) => p.id === picked) ?? null;
  const total = product ? Math.round(Number(product.price) * quantity * 100) / 100 : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (product && payerName.trim() && !own) void start({ productId: product.id, quantity, payerName: payerName.trim() });
      }}
    >
      <ul className="divide-y divide-line border-t border-line">
        {board.products.map((p) => {
          const on = p.id === picked;
          return (
            <li key={p.id}>
              <label className={cx("flex cursor-pointer items-start gap-3 p-4 transition-colors", on ? "bg-subtle" : "hover:bg-subtle")}>
                <input
                  type="radio"
                  name="product"
                  className="sr-only"
                  checked={on}
                  onChange={() => {
                    setPicked(p.id);
                    setQuantity(1);
                  }}
                />
                <ProductImage src={p.imageUrl} alt="" className="w-16" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  {p.description && <span className="mt-0.5 block text-sm text-muted">{p.description}</span>}
                  <span className="mt-1 block font-mono text-sm font-semibold tabular-nums">{formatFiat(p.price, p.currency)}</span>
                </span>
                <span
                  aria-hidden
                  className={cx("mt-1 flex h-5 w-5 shrink-0 items-center justify-center border border-ink", on && "bg-ink text-paper")}
                >
                  {on && "✓"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="space-y-4 border-t border-line p-5">
        {product && <QuantityStepper value={quantity} onChange={setQuantity} />}
        <Field label="Your name" htmlFor="buy-name" hint="So they know who paid.">
          <Input
            id="buy-name"
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Tunde Bello"
            maxLength={80}
            autoComplete="name"
          />
        </Field>
      </div>
      <Stub>
        {product && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[11px] tracking-wider text-muted uppercase">
              {quantity > 1 ? `${quantity} × ${product.name}` : product.name}
            </span>
            <span className="shrink-0 text-xl font-bold tabular-nums">{formatFiat(total, product.currency)}</span>
          </div>
        )}
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" block loading={busy} disabled={!product || !payerName.trim() || own}>
          {product ? "Buy and pay →" : "Pick a product"}
        </Button>
      </Stub>
    </form>
  );
}
