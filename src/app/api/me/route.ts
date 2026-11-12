import { eq } from "drizzle-orm";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { requireSessionAddress } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { ensureMerchant } from "@/lib/invoices";
import { CURRENCY_CODES } from "@/lib/currencies";
import { setMerchantTag } from "@/lib/merchant-tags";
import { MerchantEmail } from "@/lib/schemas";
import { TagInput } from "@/lib/tags";

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
  // The public handle ("chidi" or "chidi@nimbill"). Once claimed it can be changed but not removed.
  tag: TagInput.optional(),
  // Public board settings. An empty bio clears it.
  bio: z.string().trim().max(160, "Keep the bio under 160 characters").optional(),
  boardOpenAmounts: z.boolean().optional(),
});

// Update the merchant profile (display name, tag, optional USDT receiving address, optional email
// for "invoice paid" notifications, display currency). Fields left out keep their saved value.
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = Body.parse(await req.json());
  await ensureMerchant(address);
  // First, so a taken tag stops the whole save and nothing is half-updated.
  if (body.tag !== undefined) await setMerchantTag(address, body.tag);
  const db = await getDb();
  const changes = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.evmAddress !== undefined ? { evmAddress: body.evmAddress ? getAddress(body.evmAddress) : null } : {}),
    ...(body.email !== undefined ? { email: body.email || null } : {}),
    ...(body.displayCurrency !== undefined ? { displayCurrency: body.displayCurrency } : {}),
    ...(body.bio !== undefined ? { bio: body.bio || null } : {}),
    ...(body.boardOpenAmounts !== undefined ? { boardOpenAmounts: body.boardOpenAmounts } : {}),
  };
  const mine = eq(schema.merchants.address, address);
  // Only the tag was sent: there is nothing else to update.
  const [merchant] = Object.keys(changes).length
    ? await db.update(schema.merchants).set(changes).where(mine).returning()
    : await db.select().from(schema.merchants).where(mine);
  return json({ merchant });
});
