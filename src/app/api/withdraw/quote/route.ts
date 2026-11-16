import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { checkDestination } from "@/lib/withdraw/address";
import { findRoute } from "@/lib/withdraw/chains";
import { sampleQuote } from "@/lib/withdraw/sample";
import { QuoteBody } from "@/lib/withdraw/schemas";

// A quote for a crypto withdrawal: what the user receives, the fees, and about what it costs.
// Until a provider is connected the quote is a sample, and nothing can be paid with it.
export const POST = handle(async (req: Request) => {
  await requireSessionAddress();
  const body = QuoteBody.parse(await req.json());
  if (!findRoute(body.chain, body.asset, body.payWith)) {
    throw Errors.validation(`${body.asset} on that chain is not available when paying with ${body.payWith}.`);
  }
  const destination = checkDestination(body.chain, body.destination);
  if (!destination.ok) throw Errors.validation(destination.message);
  return json({ quote: await sampleQuote(body, destination.address) });
});
