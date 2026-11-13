import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { chequeBalance, getCheque, publicChequeView, reconcileCheque } from "@/lib/cheques";
import { nimiq } from "@/lib/clients";
import { Errors } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// Public view of a cheque by ID, plus the current Nimiq block height and the cheque wallet's
// balance, so the browser can build and sign a claim or cancel transaction without another trip.
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/cheques/[id]">) => {
  rateLimit(`cheque-get:${clientIp(req.headers)}`, 60, 60_000);
  const { id } = await ctx.params;
  if (!/^[2-9a-hjkmnp-z]{10}$/.test(id)) throw Errors.notFound("No cheque found with that link or code.");
  const c = await getCheque(id);
  if (!c) throw Errors.notFound("No cheque found with that link or code.");
  const [reconciled, currentBlock, viewer] = await Promise.all([
    reconcileCheque(c),
    nimiq.getBlockNumber().catch(() => 0),
    getSessionAddress(),
  ]);
  return json({
    cheque: await publicChequeView(reconciled, viewer),
    currentBlock,
    balance: await chequeBalance(reconciled),
  });
});
