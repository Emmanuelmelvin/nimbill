import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getWithdrawal, toView } from "@/lib/withdraw/service";

// A withdrawal's current state, for the progress screen. Asking also moves it forward (the same
// check the worker runs), so it progresses even where no worker is running.
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/withdraw/[id]">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  return json({ withdrawal: toView(await getWithdrawal(address, id)) });
});
