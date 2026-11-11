import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { reconcileMerchant } from "@/lib/invoices";
import { getEarnings, listGoals, prepareLedger, publicGoal } from "@/lib/ledger";

// Home: every payment received, what is still owed, goals, and the rates to show them in any
// unit. The browser groups payments into chart bars itself, in the viewer's own time zone.
// Also picks up payments we haven't seen yet, like the invoice list does.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileMerchant(address);
  const { fx, currency } = await prepareLedger(address);
  const [{ points, open }, goals] = await Promise.all([getEarnings(address, fx), listGoals(address)]);
  return json({ points, open, goals: goals.map(publicGoal), fx, currency });
});
