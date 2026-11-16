import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { QuoteBody } from "@/lib/withdraw/schemas";
import { createWithdrawal, toView } from "@/lib/withdraw/service";

// Start a withdrawal: creates the provider swap and returns the Lightning invoice that Nimiq Pay
// then pays. Refused unless WITHDRAW_LIVE is "true".
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  rateLimit(`withdraw-create:${address}`, 10, 10 * 60_000);
  const body = QuoteBody.parse(await req.json());
  return json({ withdrawal: toView(await createWithdrawal(address, body)) }, 201);
});
