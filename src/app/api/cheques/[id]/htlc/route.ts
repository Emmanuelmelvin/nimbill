import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { handleChequeHtlcLock } from "@/lib/cheques";
import { Errors } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { ChequeHtlcBody } from "@/lib/schemas";

// Non-custodial 2-of-2 HTLC contract lock:
// Moves a funded cheque's balance from its 2-of-2 Basic wallet into a native Nimiq HTLC contract
// whose `recipient` is the 2-of-2 cheque key and whose `sender` is the writer's link-derived refund key.
// Once `htlcTimeoutAt` passes, the writer can reclaim 100% of the NIM on-chain via `TimeoutResolve`
// even if NimBill's server is offline forever.
export const POST = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  rateLimit(`cheque-htlc:${clientIp(req.headers)}`, 20, 60_000);
  if (!/^[2-9a-hjkmnp-z]{10}$/.test(id)) throw Errors.notFound("No cheque found with that link or code.");
  const sessionAddress = await requireSessionAddress();
  const body = ChequeHtlcBody.parse(await req.json());
  return json(await handleChequeHtlcLock(id, body, sessionAddress));
});
