"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AnchorButton,
  Card,
  CoinAmount,
  Dropdown,
  EmptyState,
  Field,
  LinkButton,
  Loader,
  SegmentedControl,
  Select,
  Stat,
  StatusBadge,
  TextButton,
  TextLink,
} from "@/components/ui";
import { EarningsCard } from "@/components/EarningsCard";
import { RemindActions, ViewedStatus } from "@/components/InvoiceReminder";
import { TabPage } from "@/components/TabPage";
import { TransferList } from "@/components/TransferList";
import { api, type BookClient, type PublicInvoice } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import { localDate, type EarningPoint } from "@/lib/earnings";
import { formatMoney, type Fx } from "@/lib/money";

/** An invoice as its owner sees it: with the private client email, when the client first opened it, and a dollar value for adding up. */
type OwnInvoice = PublicInvoice & { clientEmail: string | null; viewedAt: string | null; usd: number | null };
type Listing = { invoices: OwnInvoice[]; fx: Fx | null; currency: string };

const VIEWS = [
  { value: "invoices", label: "Invoices" },
  { value: "clients", label: "Clients" },
  { value: "transfers", label: "Transfers" },
] as const;
type View = (typeof VIEWS)[number]["value"];

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

const EXPORT_RANGES = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "1y", label: "Last 12 months" },
  { value: "all", label: "All time" },
] as const;

const isOverdue = (i: PublicInvoice, today: string) => i.status === "unpaid" && !!i.dueDate && i.dueDate < today;

export default function Invoices() {
  return (
    <TabPage
      title="Invoices"
      description="Every invoice you've sent, the clients you bill, and your tag transfers — all verified on-chain."
    >
      <Suspense fallback={<Loader compact />}>
        <InvoicesScreen />
      </Suspense>
    </TabPage>
  );
}

function InvoicesScreen() {
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "/invoices?view=transfers" opens straight on transfers (linked from the send screen).
  const params = useSearchParams();
  const [view, setView] = useState<View>(params.get("view") === "transfers" ? "transfers" : "invoices");

  useEffect(() => {
    api<Listing>("/api/invoices")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="space-y-5">
      <LinkButton href="/new" size="lg" block>
        + New invoice
      </LinkButton>

      {error && <Alert kind="error">{error}</Alert>}
      {!data && !error && <Loader compact />}
      {data && (
        <>
          <SegmentedControl label="View" options={VIEWS} value={view} onChange={setView} size="md" block />
          {view === "transfers" ? (
            <TransferList />
          ) : data.invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Create your first one — it takes under a minute."
              action={
                <LinkButton href="/new" variant="secondary" size="sm">
                  Create an invoice
                </LinkButton>
              }
            />
          ) : view === "invoices" ? (
            <InvoiceList invoices={data.invoices} />
          ) : (
            <ClientList {...data} />
          )}
          {view !== "transfers" && data.invoices.some((i) => i.status === "paid") && <ExportCard />}
        </>
      )}
    </div>
  );
}

function InvoiceList({ invoices }: { invoices: OwnInvoice[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const today = localDate();
  const shown = invoices.filter((i) => filter === "all" || (filter === "overdue" ? isOverdue(i, today) : i.status === filter));
  return (
    <section className="space-y-3">
      <Dropdown aria-label="Filter invoices" options={FILTERS} value={filter} onChange={setFilter} labels="name" />
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing here.</p>
      ) : (
        <Card as="div" padding="none">
          <ul className="divide-y divide-line">
            {shown.map((inv) => (
              <li key={inv.id}>
                <Link href={`/i/${inv.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-subtle">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{inv.clientName}</p>
                    <p className="font-mono text-xs text-muted">
                      {inv.number} · {new Date(inv.createdAt).toLocaleDateString()}
                    </p>
                    {inv.status === "unpaid" && <ViewedStatus viewedAt={inv.viewedAt} className="mt-1" />}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <p className="font-bold tabular-nums">{formatFiat(inv.total, inv.currency)}</p>
                    {inv.payment ? (
                      <p className="font-mono text-xs">
                        <CoinAmount units={inv.payment.amount} asset={inv.payment.asset as "NIM" | "USDT"} />
                      </p>
                    ) : (
                      <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                    )}
                  </div>
                </Link>
                {/* Outside the row's link: buttons can't sit inside an <a>. */}
                {isOverdue(inv, today) && (
                  <div className="flex items-center gap-3 px-4 pb-4">
                    <p className="shrink-0 font-mono text-[11px] tracking-wider text-muted uppercase">Remind</p>
                    <RemindActions inv={inv} clientEmail={inv.clientEmail} size="sm" className="min-w-0 flex-1" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

type ClientRow = { name: string; count: number; paidUsd: number; openUsd: number; overdue: number; latest: OwnInvoice | null };

/**
 * Everyone you have billed, biggest first, plus clients saved for later. Totals are worked out
 * from the invoices; cancelled ones don't count.
 */
function ClientList({ invoices, fx, currency }: Listing) {
  const [book, setBook] = useState<BookClient[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The client whose earnings are being looked at (their name, lower-cased), if any.
  const [open, setOpen] = useState<string | null>(null);
  const loadBook = () =>
    api<{ clients: BookClient[] }>("/api/clients")
      .then((r) => setBook(r.clients))
      .catch((e) => setError((e as Error).message));
  useEffect(() => {
    loadBook();
  }, []);
  const savedByKey = useMemo(() => new Map(book.filter((c) => c.saved).map((c) => [c.name.toLowerCase(), c])), [book]);

  async function toggleSaved(c: ClientRow) {
    const key = c.name.toLowerCase();
    const saved = savedByKey.get(key);
    setBusy(key);
    setError(null);
    try {
      if (saved) await api(`/api/clients/${saved.id}`, { method: "DELETE" });
      else await api("/api/clients", { body: { name: c.name, email: c.latest?.clientEmail ?? "" } });
      await loadBook();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const clients = useMemo(() => {
    const m = new Map<string, ClientRow>();
    const today = localDate();
    // Newest first, so the first invoice seen for a client is their latest.
    for (const i of invoices) {
      if (i.status === "cancelled") continue;
      const key = i.clientName.trim().toLowerCase();
      const c = m.get(key) ?? { name: i.clientName.trim(), count: 0, paidUsd: 0, openUsd: 0, overdue: 0, latest: i };
      c.count += 1;
      if (i.status === "paid") c.paidUsd += i.usd ?? 0;
      else c.openUsd += i.usd ?? 0;
      if (isOverdue(i, today)) c.overdue += 1;
      m.set(key, c);
    }
    // Saved clients that have no invoice yet still belong in the list.
    for (const [key, c] of savedByKey) {
      if (!m.has(key)) m.set(key, { name: c.name, count: 0, paidUsd: 0, openUsd: 0, overdue: 0, latest: null });
    }
    return [...m.values()].sort((a, b) => b.paidUsd + b.openUsd - (a.paidUsd + a.openUsd));
  }, [invoices, savedByKey]);
  const money = (usd: number) => formatMoney(usd, currency, fx);

  if (clients.length === 0) return <p className="py-6 text-center text-sm text-muted">No clients yet.</p>;
  const opened = open === null ? null : clients.find((c) => c.name.toLowerCase() === open);
  if (opened) {
    return (
      <ClientDetail
        client={opened}
        invoices={invoices.filter((i) => i.clientName.trim().toLowerCase() === open)}
        fx={fx}
        currency={currency}
        onBack={() => setOpen(null)}
      />
    );
  }
  return (
    <section className="space-y-3">
      <Card as="div" padding="none">
        <ul className="divide-y divide-line">
          {clients.map((c) => (
            <li key={c.name} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setOpen(c.name.toLowerCase())}
                  className="block max-w-full truncate text-left font-semibold underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {c.name}
                </button>
                <p className="font-mono text-xs text-muted">
                  {c.latest
                    ? `${c.count} ${c.count === 1 ? "invoice" : "invoices"} · last ${new Date(c.latest.createdAt).toLocaleDateString()}`
                    : "No invoices yet"}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm">
                  {c.latest && (
                    <TextLink href={`/new?from=${c.latest.id}`} muted>
                      Invoice again
                    </TextLink>
                  )}
                  <TextButton disabled={busy === c.name.toLowerCase()} onClick={() => toggleSaved(c)}>
                    {savedByKey.has(c.name.toLowerCase()) ? "Saved ✓ · remove" : "Save for later"}
                  </TextButton>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold tabular-nums">{money(c.paidUsd)}</p>
                <p className="font-mono text-xs text-muted">paid</p>
                {c.openUsd > 0 && (
                  <p className="mt-1 font-mono text-xs">
                    {money(c.openUsd)} {c.overdue > 0 ? "overdue" : "owed"}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-xs text-muted">
        Tap a client to see everything they have paid you. Saved clients can be picked from a list when you create an invoice. Totals are
        shown in {fx ? currency : "US dollars"}, converted at today&apos;s rate. Invoices with the same client name are grouped.
      </p>
    </section>
  );
}

/** One client: what they have paid over time, what they still owe, and their invoices. */
function ClientDetail({
  client,
  invoices,
  fx,
  currency,
  onBack,
}: {
  client: ClientRow;
  invoices: OwnInvoice[];
  fx: Fx | null;
  currency: string;
  onBack: () => void;
}) {
  const points = useMemo<EarningPoint[]>(
    () =>
      invoices
        .filter((i) => i.status === "paid" && i.payment)
        .map((i) => ({
          at: i.payment!.paidAt,
          usd: i.usd ?? 0,
          asset: i.payment!.asset as "NIM" | "USDT",
          amount: i.payment!.amount,
          client: i.clientName,
        })),
    [invoices],
  );
  const whole = (usd: number) => formatMoney(usd, currency, fx, { whole: true });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 truncate text-lg font-bold">{client.name}</h2>
        <TextButton className="shrink-0" onClick={onBack}>
          ← All clients
        </TextButton>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Paid you" value={whole(client.paidUsd)} sub={`${points.length} ${points.length === 1 ? "payment" : "payments"}`} />
        <Stat
          label={client.overdue > 0 ? "Overdue" : "Owes you"}
          value={whole(client.openUsd)}
          sub={`${client.count} ${client.count === 1 ? "invoice" : "invoices"} in total`}
        />
      </div>
      <EarningsCard points={points} fx={fx} currency={currency} defaultRange="1y" single />
      {client.latest && (
        <LinkButton href={`/new?from=${client.latest.id}`} variant="secondary" block>
          Invoice {client.name} again
        </LinkButton>
      )}
      {invoices.length > 0 && <InvoiceList invoices={invoices} />}
    </section>
  );
}

function ExportCard() {
  const [range, setRange] = useState<(typeof EXPORT_RANGES)[number]["value"]>("all");
  return (
    <Card tone="subtle" className="space-y-3">
      <Field
        label="Export payments"
        htmlFor="export-range"
        hint="A CSV file of paid invoices with amounts, rates and transactions, for your records."
      >
        <Select id="export-range" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
          {EXPORT_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <AnchorButton href={`/api/invoices/export?range=${range}`} download variant="secondary" block>
        Download CSV
      </AnchorButton>
    </Card>
  );
}
