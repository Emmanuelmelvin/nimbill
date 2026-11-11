"use client";
import { Alert, Loader } from "@/components/ui";
import { GoalsCard } from "@/components/Goals";
import { StakeCard } from "@/components/StakeCard";
import { TabPage } from "@/components/TabPage";
import { useLedger } from "@/lib/client/ledger";

export default function Save() {
  return (
    <TabPage title="Save" description="Set a target for what you earn, and put your NIM to work.">
      <SaveScreen />
    </TabPage>
  );
}

function SaveScreen() {
  const { ledger, error, reload } = useLedger();
  // Everything earned in NIM so far is the suggested amount to stake.
  const nimEarned = (ledger?.points ?? []).filter((p) => p.asset === "NIM").reduce((s, p) => s + Number(p.amount), 0);
  return (
    <div className="space-y-6">
      {error && <Alert kind="error">{error}</Alert>}
      {!ledger && !error && <Loader compact />}
      {ledger && <GoalsCard goals={ledger.goals} points={ledger.points} fx={ledger.fx} currency={ledger.currency} onChanged={reload} />}
      <StakeCard suggestedLuna={nimEarned} />
    </div>
  );
}
