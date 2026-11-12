import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { getCheque, publicChequeView, reconcileCheque } from "@/lib/cheques";
import { nimiq } from "@/lib/clients";
import { Errors } from "@/lib/errors";

// Public view of a cheque by ID, plus the current Nimiq block height so the browser can
// construct and sign a claim or cancel transaction without an extra round-trip.
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/cheques/[id]">) => {
  const { id } = await ctx.params;
  let c = await getCheque(id);
  if (!c) throw Errors.notFound("No cheque found with that link or code.");
  const [reconciled, currentBlock, viewer] = await Promise.all([
    reconcileCheque(c),
    nimiq.getBlockNumber().catch(() => 0),
    getSessionAddress(),
  ]);
  c = reconciled;
  return json({
    cheque: await publicChequeView(c, viewer),
    currentBlock,
  });
});
