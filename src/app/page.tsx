"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Button, Card, Header, LinkButton, Loader, OpenInNimiqPay, PageTitle, Stat, TabBar, TextLink } from "@/components/ui";
import { EarningsCard } from "@/components/EarningsCard";
import { GoalProgress, currentGoal } from "@/components/Goals";
import { PayByNumber } from "@/components/PayByNumber";
import { ProfileForm } from "@/components/ProfileForm";
import { api, type PublicInvoice } from "@/lib/client/api";
import { useLedger } from "@/lib/client/ledger";
import { useNimiq } from "@/lib/client/nimiq";
import { useSession, useSignIn } from "@/lib/client/session";
import { localDate } from "@/lib/earnings";
import { formatMoney } from "@/lib/money";

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
        <>
          <Dashboard />
          <TabBar />
        </>
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

      <PayByNumber />

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

/** Signed-in home: what came in, what is still owed, and how the goal is going. */
function Dashboard() {
  const { ledger, error } = useLedger();

  const owed = useMemo(() => {
    const today = localDate();
    const open = ledger?.open ?? [];
    const overdue = open.filter((i) => i.dueDate && i.dueDate < today);
    const sum = (list: typeof open) => list.reduce((s, i) => s + (i.usd ?? 0), 0);
    return { count: open.length, usd: sum(open), overdueCount: overdue.length, overdueUsd: sum(overdue) };
  }, [ledger]);

  if (error && !ledger) return <Alert kind="error">{error}</Alert>;
  if (!ledger) return <Loader />;

  const goal = currentGoal(ledger.goals);
  const plural = (n: number) => `${n} ${n === 1 ? "invoice" : "invoices"}`;
  const money = (usd: number) => formatMoney(usd, ledger.currency, ledger.fx, { whole: true });

  return (
    <div className="space-y-6">
      {/* Remount when the currency changes so the unit toggle starts on it. */}
      <EarningsCard key={ledger.currency} points={ledger.points} fx={ledger.fx} currency={ledger.currency} goal={goal} />

      <LinkButton href="/new" size="lg" block>
        + New invoice
      </LinkButton>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Outstanding" value={money(owed.usd)} sub={plural(owed.count)} />
        <Stat label="Overdue" value={money(owed.overdueUsd)} sub={plural(owed.overdueCount)} />
      </div>

      {goal ? (
        <Card>
          <GoalProgress
            goal={goal}
            points={ledger.points}
            fx={ledger.fx}
            action={
              <p className="text-sm">
                <TextLink href="/save" muted>
                  Manage goal
                </TextLink>
              </p>
            }
          />
        </Card>
      ) : (
        <Card tone="subtle" className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Set an earnings goal</p>
            <p className="text-sm text-muted">Pick a target and a deadline, and track how close you are.</p>
          </div>
          <LinkButton href="/save" variant="secondary" size="sm" className="shrink-0">
            Set goal
          </LinkButton>
        </Card>
      )}

      <p className="text-center text-sm">
        <TextLink href="/pay" muted>
          Pay an invoice with a Nimbill number
        </TextLink>
      </p>
    </div>
  );
}
