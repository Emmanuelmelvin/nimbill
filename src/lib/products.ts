import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import type { Product } from "./db/schema";
import { Errors } from "./errors";
import { newId } from "./invoices";
import { MAX_IMAGE_BYTES, MAX_PRODUCTS, type ProductBody, type ProductPatchBody } from "./schemas";
import type { z } from "zod";

const NOT_FOUND = "Product not found.";

export async function listProducts(merchantAddress: string, onlyActive = false): Promise<Product[]> {
  const db = await getDb();
  const conds = [eq(schema.products.merchantAddress, merchantAddress)];
  if (onlyActive) conds.push(eq(schema.products.active, true));
  return db
    .select()
    .from(schema.products)
    .where(and(...conds))
    .orderBy(desc(schema.products.createdAt));
}

export async function getProduct(id: string): Promise<Product | null> {
  const db = await getDb();
  const [p] = await db.select().from(schema.products).where(eq(schema.products.id, id));
  return p ?? null;
}

/** The merchant's own product, or a not-found error (someone else's looks the same as a missing one). */
export async function getOwnProduct(id: string, merchantAddress: string): Promise<Product> {
  const p = await getProduct(id);
  if (!p || p.merchantAddress !== merchantAddress) throw Errors.notFound(NOT_FOUND);
  return p;
}

export async function createProduct(merchantAddress: string, input: z.output<typeof ProductBody>): Promise<Product> {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(schema.products).where(eq(schema.products.merchantAddress, merchantAddress));
  if (n >= MAX_PRODUCTS) throw Errors.badRequest(`You can list up to ${MAX_PRODUCTS} products. Delete one to add another.`);
  const [p] = await db
    .insert(schema.products)
    .values({
      id: newId(),
      merchantAddress,
      name: input.name,
      description: input.description || null,
      price: input.price.toFixed(2),
      currency: input.currency,
      active: input.active ?? true,
    })
    .returning();
  return p;
}

export async function updateProduct(id: string, merchantAddress: string, input: z.output<typeof ProductPatchBody>): Promise<Product> {
  await getOwnProduct(id, merchantAddress);
  const db = await getDb();
  const [p] = await db
    .update(schema.products)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.price !== undefined ? { price: input.price.toFixed(2) } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.products.id, id))
    .returning();
  return p;
}

/**
 * Remove a product for good. Invoices for it keep their own copy of the name and price,
 * so receipts don't change.
 */
export async function deleteProduct(id: string, merchantAddress: string): Promise<void> {
  await getOwnProduct(id, merchantAddress);
  const db = await getDb();
  await db.delete(schema.productImages).where(eq(schema.productImages.productId, id));
  await db.delete(schema.products).where(eq(schema.products.id, id));
}

/** Set or replace the picture. `dataUrl` has already passed ProductImageBody. */
export async function setProductImage(id: string, merchantAddress: string, dataUrl: string): Promise<Product> {
  const p = await getOwnProduct(id, merchantAddress);
  const [, mime, data] = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/)!;
  if (Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) throw Errors.validation("That picture is too large. Try a smaller one.");
  const db = await getDb();
  await db
    .insert(schema.productImages)
    .values({ productId: id, mime, data })
    .onConflictDoUpdate({ target: schema.productImages.productId, set: { mime, data } });
  const [updated] = await db
    .update(schema.products)
    .set({ imageVersion: (p.imageVersion ?? 0) + 1, updatedAt: new Date() })
    .where(eq(schema.products.id, id))
    .returning();
  return updated;
}

export async function removeProductImage(id: string, merchantAddress: string): Promise<Product> {
  await getOwnProduct(id, merchantAddress);
  const db = await getDb();
  await db.delete(schema.productImages).where(eq(schema.productImages.productId, id));
  const [updated] = await db
    .update(schema.products)
    .set({ imageVersion: null, updatedAt: new Date() })
    .where(eq(schema.products.id, id))
    .returning();
  return updated;
}

export async function getProductImage(id: string): Promise<{ mime: string; bytes: Buffer } | null> {
  const db = await getDb();
  const [img] = await db.select().from(schema.productImages).where(eq(schema.productImages.productId, id));
  return img ? { mime: img.mime, bytes: Buffer.from(img.data, "base64") } : null;
}

/** A product as anyone may see it. The picture URL changes with every new picture. */
export function productView(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: p.price,
    currency: p.currency,
    active: p.active,
    imageUrl: p.imageVersion ? `/api/products/${p.id}/image?v=${p.imageVersion}` : null,
    createdAt: p.createdAt.toISOString(),
  };
}
export type ProductView = ReturnType<typeof productView>;
