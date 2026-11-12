import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { sameNimAddress } from "@/lib/clients";
import { Errors } from "@/lib/errors";
import { TransferVerifyBody } from "@/lib/schemas";
import { getTransfer, transferView, verifyTransfer } from "@/lib/transfers";

// The sender reports the transaction hash; the server checks it on-chain before calling it sent.
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/transfers/[id]/verify">) => {
  const { id } = await ctx.params;
  const me = await requireSessionAddress();
  const { txHash } = TransferVerifyBody.parse(await req.json());
  const t = await getTransfer(id);
  // Someone else's transfer looks the same as a missing one.
  if (!t || !sameNimAddress(t.fromAddress, me)) throw Errors.notFound("Transfer not found.");
  const r = await verifyTransfer(t, txHash);
  return json(r.status === "confirmed" ? { status: r.status, transfer: transferView(r.transfer, me) } : r);
});
