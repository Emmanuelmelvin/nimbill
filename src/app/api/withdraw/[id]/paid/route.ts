import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { markPaid, toView } from "@/lib/withdraw/service";

// The Withdraw screen reports that Nimiq Pay accepted the payment (what payLightningInvoice returned).
// Only a hint for the progress screen: what counts is what the provider and the chain say.
const Body = z.object({ hash: z.string().max(200).optional(), swapId: z.string().max(200).optional() });

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/withdraw/[id]/paid">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  return json({ withdrawal: toView(await markPaid(address, id, Body.parse(await req.json()))) });
});
