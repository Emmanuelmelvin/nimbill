import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { QuoteBody } from "@/lib/withdraw/schemas";
import { createWithdrawal, listWithdrawals, toView } from "@/lib/withdraw/service";

// Recent withdrawals for the signed-in user (newest first), bringing any open ones up to date.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  rateLimit(`withdraw-list:${address}`, 30, 60_000);
  const rows = await listWithdrawals(address);
  return json({ withdrawals: rows.map(toView) });
});

// Start a withdrawal: creates the provider swap and returns the Lightning invoice that Nimiq Pay
// then pays. Refused unless WITHDRAW_LIVE is "true".
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  rateLimit(`withdraw-create:${address}`, 10, 10 * 60_000);
  const body = QuoteBody.parse(await req.json());
  return json({ withdrawal: toView(await createWithdrawal(address, body)) }, 201);
});
