import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { deleteGoal, publicGoal, updateGoal } from "@/lib/ledger";
import { GoalBody } from "@/lib/schemas";

// Edit a goal (owner only).
export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/goals/[id]">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  const { today, ...input } = GoalBody.parse(await req.json());
  return json({ goal: publicGoal(await updateGoal(address, id, input, today)) });
});

export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/goals/[id]">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  await deleteGoal(address, id);
  return json({ ok: true });
});
