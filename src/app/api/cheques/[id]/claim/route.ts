import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { handleChequeClaim } from "@/lib/cheques";
import { ChequeClaimBody } from "@/lib/schemas";

// Non-custodial 2-of-2 claim or writer cancel:
// - step="prepare": checks the cheque rules (e.g. locked to @tag, or writer cancel) and returns the server's partial signature.
// - step="broadcast": verifies the completed 139-byte signed transaction and relays it to the Nimiq network.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/cheques/[id]/claim">) => {
  const { id } = await ctx.params;
  const sessionAddress = await getSessionAddress();
  const body = ChequeClaimBody.parse(await req.json());
  return json(await handleChequeClaim(id, body, sessionAddress));
});
