import { eq } from "drizzle-orm";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { requireSessionAddress } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ensureMerchant } from "@/lib/invoices";
import { CURRENCY_CODES } from "@/lib/currencies";
import { MerchantEmail } from "@/lib/schemas";

const Body = z.object({
  // Optional so one preference can be saved by itself; the profile form always sends it.
  name: z.string().trim().min(1, "Enter your name or business name").max(80).optional(),
  evmAddress: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine((v) => !v || isAddress(v), "That is not a valid Polygon address"),
  email: MerchantEmail,
  // The fiat currency dashboard totals are shown in. null goes back to following the latest invoice.
  displayCurrency: z.enum(CURRENCY_CODES, { error: "Unsupported currency" }).nullable().optional(),
});

// Update the merchant profile (display name, optional USDT receiving address, optional email
// for "invoice paid" notifications, display currency). Fields left out keep their saved value.
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = Body.parse(await req.json());
  await ensureMerchant(address);
  const db = await getDb();
  const [merchant] = await db
    .update(schema.merchants)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.evmAddress !== undefined ? { evmAddress: body.evmAddress ? getAddress(body.evmAddress) : null } : {}),
      ...(body.email !== undefined ? { email: body.email || null } : {}),
      ...(body.displayCurrency !== undefined ? { displayCurrency: body.displayCurrency } : {}),
    })
    .where(eq(schema.merchants.address, address))
    .returning();
  return json({ merchant });
});
