import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { removeClient } from "@/lib/clients-book";

// Forget a saved client (owner only). Their invoices are not touched.
export const DELETE = handle(async (_req: NextRequest, ctx: RouteContext<"/api/clients/[id]">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  await removeClient(address, id);
  return json({ ok: true });
});
