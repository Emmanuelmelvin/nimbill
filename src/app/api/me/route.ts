import { eq } from "drizzle-orm";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { requireSessionAddress } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ensureMerchant } from "@/lib/invoices";
import { MerchantEmail } from "@/lib/schemas";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name or business name").max(80),
  evmAddress: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => !v || isAddress(v), "That is not a valid Polygon address"),
  email: MerchantEmail,
});

// Update the merchant profile (display name, optional USDT receiving address, optional email
// for "invoice paid" notifications).
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = Body.parse(await req.json());
  await ensureMerchant(address);
  const db = await getDb();
  const [merchant] = await db
    .update(schema.merchants)
    .set({
      name: body.name,
      ...(body.evmAddress !== undefined ? { evmAddress: body.evmAddress ? getAddress(body.evmAddress) : null } : {}),
      ...(body.email !== undefined ? { email: body.email || null } : {}),
    })
    .where(eq(schema.merchants.address, address))
    .returning();
  return json({ merchant });
});
