import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { ensureMerchant } from "@/lib/invoices";
import { createGoal, listGoals, publicGoal } from "@/lib/ledger";
import { GoalBody } from "@/lib/schemas";

export const GET = handle(async () => {
  const address = await requireSessionAddress();
  return json({ goals: (await listGoals(address)).map(publicGoal) });
});

export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const { today, ...input } = GoalBody.parse(await req.json());
  await ensureMerchant(address);
  return json({ goal: publicGoal(await createGoal(address, input, today)) }, 201);
});
