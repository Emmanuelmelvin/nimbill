"use client";
import { Badge, Card, CardHeader } from "@/components/ui";

// "Bank and mobile money": not built. Shown as coming soon only, with no waitlist or promises about
// how payouts will work, until a licensed payout partner is in place.

export function FiatWithdraw() {
  return (
    <Card>
      <CardHeader
        icon="₦"
        title="Bank and mobile money"
        description="Cashing out to a bank account or mobile money wallet is coming soon. For now, withdraw to crypto."
        action={<Badge variant="muted">Coming soon</Badge>}
      />
    </Card>
  );
}
