import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { soldCounts } from "@/lib/board-server";
import { createProduct, listProducts, productView } from "@/lib/products";
import { ProductBody } from "@/lib/schemas";

// My products, hidden ones included, with how many of each were bought and paid for.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  const products = await listProducts(address);
  const sold = await soldCounts(products.map((p) => p.id));
  return json({ products: products.map((p) => ({ ...productView(p), sold: sold[p.id] ?? 0 })) });
});

export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = ProductBody.parse(await req.json());
  return json({ product: productView(await createProduct(address, body)) }, 201);
});
