import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { handleChequeClaim } from "@/lib/cheques";
import { Errors } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ChequeClaimBody } from "@/lib/schemas";

// Non-custodial 2-of-2 claim or writer cancel:
// - step="prepare": checks the cheque rules (e.g. locked to @tag, or writer cancel) and returns the server's partial signature.
// - step="broadcast": verifies the completed 139-byte signed transaction and relays it to the Nimiq network.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/cheques/[id]/claim">) => {
  const { id } = await ctx.params;
  rateLimit(`cheque-claim:${clientIp(req.headers)}`, 20, 60_000);
  rateLimit(`cheque-claim-id:${id}`, 30, 60_000);
  if (!/^[2-9a-hjkmnp-z]{10}$/.test(id)) throw Errors.notFound("No cheque found with that link or code.");
  const sessionAddress = await getSessionAddress();
  const body = ChequeClaimBody.parse(await req.json());
  return json(await handleChequeClaim(id, body, sessionAddress));
});
