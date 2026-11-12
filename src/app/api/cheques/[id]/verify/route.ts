import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getCheque, publicChequeView, verifyChequeFunding } from "@/lib/cheques";
import { sameNimAddress } from "@/lib/clients";
import { Errors } from "@/lib/errors";
import { ChequeVerifyBody } from "@/lib/schemas";

// The writer reports the funding transaction hash; the server checks it on-chain before marking the cheque funded.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/cheques/[id]/verify">) => {
  const { id } = await ctx.params;
  const me = await requireSessionAddress();
  const { txHash } = ChequeVerifyBody.parse(await req.json());
  const c = await getCheque(id);
  if (!c || !sameNimAddress(c.writerAddress, me)) throw Errors.notFound("Cheque not found.");
  const r = await verifyChequeFunding(c, txHash);
  if (r.status === "funded" || r.status === "cashed" || r.status === "cancelled") {
    return json({ status: r.status, cheque: await publicChequeView(r.cheque, me) });
  }
  return json(r);
});
