"use client";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { TabPage } from "@/components/TabPage";

export default function Withdraw() {
  return (
    <TabPage title="Withdraw" description="Payments land in your own wallet, so your NIM and USDT are already yours to move.">
      {/* Placeholder for the upcoming USDT → local-currency payout (Paycrest, Nigeria first). */}
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
    </TabPage>
  );
}
