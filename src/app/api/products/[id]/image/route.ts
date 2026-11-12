import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getSessionAddress, requireSessionAddress } from "@/lib/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { getProduct, getProductImage, productView, removeProductImage, setProductImage } from "@/lib/products";
import { ProductImageBody } from "@/lib/schemas";

type Ctx = RouteContext<"/api/products/[id]/image">;

// Public: the picture itself. Its URL carries a version, so it can be cached for good.
// Reading it is open to other sites (CORS); changing it (PUT, DELETE) is not.
export const OPTIONS = corsPreflight(["GET"]);
export const GET = withCors(
  ["GET"],
  handle(async (_req: NextRequest, ctx: Ctx) => {
    const { id } = await ctx.params;
    const product = await getProduct(id);
    const img = product?.imageVersion ? await getProductImage(id) : null;
    if (!product || !img) throw Errors.notFound("Picture not found.");
    // A hidden product's picture is only for its owner.
    if (!product.active && (await getSessionAddress()) !== product.merchantAddress) throw Errors.notFound("Picture not found.");
    return new Response(new Uint8Array(img.bytes), {
      headers: {
        "content-type": img.mime,
        "cache-control": product.active ? "public, max-age=31536000, immutable" : "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }),
);

// Set or replace the picture (a data URL, already shrunk by the browser).
export const PUT = handle(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  const { dataUrl } = ProductImageBody.parse(await req.json());
  return json({ product: productView(await setProductImage(id, address, dataUrl)) });
});

export const DELETE = handle(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  return json({ product: productView(await removeProductImage(id, address)) });
});
