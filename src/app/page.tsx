"use client";
import { useMemo } from "react";
import { Alert, Card, Header, LinkButton, Loader, ModeSwitch, PageTitle, Stat, TabBar, TextLink } from "@/components/ui";
import { EarningsCard } from "@/components/EarningsCard";
import { ActionStrip, TagRow } from "@/components/HomeActions";
import { GoalProgress, currentGoal } from "@/components/Goals";
import { Landing } from "@/components/landing/Landing";
import { ProfileForm } from "@/components/ProfileForm";
import { useLedger } from "@/lib/client/ledger";
import { useSession } from "@/lib/client/session";
import { localDate } from "@/lib/earnings";
import { formatMoney } from "@/lib/money";

export default function Home() {
  const { merchant, loading } = useSession();
  // Signed out: the landing page brings its own full-width header.
  if (!loading && !merchant) return <Landing />;
  return (
    <>
      <Header />
      {loading || !merchant ? (
        <Loader />
      ) : !merchant.name ? (
        <div>
          <PageTitle title="Welcome! One quick step" description="This is how your name appears on invoices and receipts." />
          <Card>
            <ProfileForm submitLabel="Continue" />
          </Card>
        </div>
      ) : (
        <>
          <ModeSwitch />
          <Dashboard />
          <TabBar />
        </>
      )}
    </>
  );
}

/** Signed-in home: what came in, what is still owed, and how the goal is going. */
function Dashboard() {
  const { ledger, error } = useLedger();
  const { merchant } = useSession();

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
      {merchant?.tag && <TagRow tag={merchant.tag} />}

      {/* Accounts made before tags existed: ask once, until a tag is claimed. */}
      {merchant && !merchant.tag && (
        <Card tone="strong" className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">Claim your NimBill tag</p>
            <p className="text-sm text-muted">Get paid with a short name like ada@nimbill instead of a wallet address.</p>
          </div>
          <LinkButton href="/settings#tag" size="sm" className="shrink-0">
            Claim tag
          </LinkButton>
        </Card>
      )}

      {/* Remount when the currency changes so the unit toggle starts on it. */}
      <EarningsCard key={ledger.currency} points={ledger.points} fx={ledger.fx} currency={ledger.currency} goal={goal} />

      <ActionStrip />

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
