"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Header,
  LinkButton,
  Loader,
  OpenInNimiqPay,
  PageTitle,
  SegmentedControl,
  Stat,
  StatusBadge,
  TextLink,
} from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { StakeCard } from "@/components/StakeCard";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useNimiq } from "@/lib/client/nimiq";
import { useSession, useSignIn } from "@/lib/client/session";
import { formatAsset, formatFiat } from "@/lib/currencies";

export default function Home() {
  const { merchant, loading } = useSession();
  return (
    <>
      <Header />
      {loading ? (
        <Loader />
      ) : !merchant ? (
        <Landing />
      ) : !merchant.name ? (
        <div>
          <PageTitle title="Welcome! One quick step" description="This is how your name appears on invoices and receipts." />
          <Card>
            <ProfileForm submitLabel="Continue" />
          </Card>
        </div>
      ) : (
        <Dashboard />
      )}
    </>
  );
}

function TryDemo() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        block
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const { invoice } = await api<{ invoice: PublicInvoice }>("/api/demo", { method: "POST" });
            router.push(`/i/${invoice.id}`);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        Try it: pay a sample invoice (≈ $0.05)
      </Button>
      {error && <Alert kind="error">{error}</Alert>}
    </>
  );
}

const FEATURES = [
  ["₦", "Price in Naira, Shillings, Euros…", "Clients pay the exact amount at a live rate, locked for 5 minutes."],
  ["✓", "Verified on the blockchain", "An invoice is marked paid only after we see the payment on-chain."],
  ["→", "No middleman, no account for clients", "Money goes wallet-to-wallet. We never hold your funds."],
  ["%", "Grow what you earn", "Stake your NIM earnings with one tap, right after you get paid."],
] as const;

function Landing() {
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-[2rem] leading-[1.1] font-bold tracking-tight">
          Invoice in your currency.
          <br />
          <span className="text-muted">Get paid in NIM or USDT.</span>
        </h1>
        <p className="mt-3 text-muted">
          For freelancers and small businesses. Send a link — your client pays from their wallet, straight into yours.
        </p>
      </section>

      <CallToAction />

      <Card as="div" padding="none">
        <ul className="divide-y divide-line">
          {FEATURES.map(([icon, title, text]) => (
            <li key={title} className="flex gap-4 p-4">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center border border-ink font-mono font-bold">
                {icon}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-center text-sm">
        <TextLink href="/stats" muted>
          See payments made with NimBill
        </TextLink>
      </p>
    </div>
  );
}

function CallToAction() {
  const { state } = useNimiq();
  const { signIn, busy, error } = useSignIn();
  return (
    <div className="space-y-3">
      {state === "checking" ? (
        <Loader compact />
      ) : state === "ready" ? (
        <>
          <Button size="lg" block loading={busy} onClick={signIn}>
            Start invoicing — sign in with Nimiq Pay
          </Button>
          <p className="text-center text-xs text-muted">Signing a message proves the wallet is yours. It costs nothing.</p>
          {error && <Alert kind="error">{error}</Alert>}
        </>
      ) : (
        <OpenInNimiqPay text="NimBill is a Nimiq Pay Mini App. Open it in Nimiq Pay to create invoices and pay them." />
      )}
      <TryDemo />
    </div>
  );
}

/** Placeholder for the upcoming USDT → local-currency payout (Paycrest, Nigeria first). */
function WithdrawToBankCard() {
  return (
    <Card tone="subtle" aria-disabled="true">
      <CardHeader
        icon="₦"
        title="Withdraw to bank"
        description="Cash out your USDT straight to a Nigerian bank account, in Naira."
        action={<Badge variant="muted">Coming soon</Badge>}
      />
      <Button variant="secondary" block disabled className="mt-4">
        Withdraw to bank
      </Button>
    </Card>
  );
}

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
] as const;

function Dashboard() {
  const [invoices, setInvoices] = useState<PublicInvoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unpaid" | "paid">("all");

  useEffect(() => {
    api<{ invoices: PublicInvoice[] }>("/api/invoices")
      .then((r) => setInvoices(r.invoices))
      .catch((e) => setError(e.message));
  }, []);

  const summary = useMemo(() => {
    const list = invoices ?? [];
    const paid = list.filter((i) => i.status === "paid");
    const open = list.filter((i) => i.status === "unpaid");
    const sumBy = (arr: PublicInvoice[]) => {
      const m = new Map<string, number>();
      arr.forEach((i) => m.set(i.currency, (m.get(i.currency) ?? 0) + Number(i.total)));
      return [...m.entries()].map(([c, v]) => formatFiat(v, c)).join(" + ") || formatFiat(0, "USD");
    };
    const nimEarned = paid.filter((i) => i.payment?.asset === "NIM").reduce((s, i) => s + Number(i.payment!.amount), 0);
    return { paidCount: paid.length, openCount: open.length, paidSum: sumBy(paid), openSum: sumBy(open), nimEarned };
  }, [invoices]);

  const shown = (invoices ?? []).filter((i) => filter === "all" || i.status === filter);
  const plural = (n: number) => `${n} ${n === 1 ? "invoice" : "invoices"}`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Paid" value={summary.paidSum} sub={plural(summary.paidCount)} />
        <Stat label="Outstanding" value={summary.openSum} sub={plural(summary.openCount)} />
      </div>

      <LinkButton href="/new" size="lg" block>
        + New invoice
      </LinkButton>

      <StakeCard suggestedLuna={summary.nimEarned} />

      <WithdrawToBankCard />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Invoices</h2>
          <SegmentedControl label="Filter invoices" options={FILTERS} value={filter} onChange={setFilter} />
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        {!invoices && !error && <Loader compact />}
        {invoices && invoices.length === 0 && (
          <EmptyState
            title="No invoices yet"
            description="Create your first one — it takes under a minute."
            action={
              <LinkButton href="/new" variant="secondary" size="sm">
                Create an invoice
              </LinkButton>
            }
          />
        )}
        {invoices && invoices.length > 0 && shown.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing here.</p>}
        {shown.length > 0 && (
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
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      <p className="font-bold tabular-nums">{formatFiat(inv.total, inv.currency)}</p>
                      {inv.payment ? (
                        <p className="font-mono text-xs">{formatAsset(inv.payment.amount, inv.payment.asset as "NIM" | "USDT")}</p>
                      ) : (
                        <StatusBadge status={inv.status} dueDate={inv.dueDate} />
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
