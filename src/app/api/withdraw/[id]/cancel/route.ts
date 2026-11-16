import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { markCancelled, toView } from "@/lib/withdraw/service";

// The user declined in Nimiq Pay, or Nimiq Pay refused the payment: nothing was spent. The
// provider's invoice simply runs out unpaid.
const Body = z.object({ reason: z.string().trim().max(300).default("Cancelled in Nimiq Pay. Nothing was spent.") });

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/withdraw/[id]/cancel">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  const { reason } = Body.parse(await req.json().catch(() => ({})));
  return json({ withdrawal: toView(await markCancelled(address, id, reason)) });
});
