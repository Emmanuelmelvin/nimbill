import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { deleteProduct, getOwnProduct, productView, updateProduct } from "@/lib/products";
import { ProductPatchBody } from "@/lib/schemas";

type Ctx = RouteContext<"/api/products/[id]">;

// One of my products, for the edit screen.
export const GET = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  return json({ product: productView(await getOwnProduct(id, address)) });
});

// Change some fields. Fields left out keep their value.
export const PATCH = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  const body = ProductPatchBody.parse(await req.json());
  return json({ product: productView(await updateProduct(id, address, body)) });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  await deleteProduct(id, address);
  return json({ ok: true });
});
