import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { QuoteBody } from "@/lib/withdraw/schemas";
import { quote } from "@/lib/withdraw/service";

// A quote for a crypto withdrawal: what the user receives, the fees, and about what it costs.
// Live from the provider when WITHDRAW_LIVE is "true"; a sample (nothing can be paid) otherwise.
export const POST = handle(async (req: Request) => {
  await requireSessionAddress();
  return json({ quote: await quote(QuoteBody.parse(await req.json())) });
});
