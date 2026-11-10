import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionAddress } from "@/lib/auth";
import { fail, handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { CURRENCY_CODES } from "@/lib/currencies";
import { computeTotal, createInvoice, listInvoices, publicInvoice, reconcileMerchant } from "@/lib/invoices";

// Dashboard: my invoices. Also picks up NIM payments we haven't seen yet.
export const GET = handle(async () => {
  const address = await getSessionAddress();
  if (!address) return fail("Please sign in first.", 401);
  await reconcileMerchant(address);
  const invoices = await listInvoices(address);
  return json({ invoices: invoices.map((i) => ({ ...publicInvoice(i), clientEmail: i.clientEmail })) });
});

const Item = z.object({
  description: z.string().trim().min(1, "Each line needs a description").max(120),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(100000),
  unitPrice: z.coerce.number().positive("Price must be more than 0").max(1e12),
});

const Body = z.object({
  clientName: z.string().trim().min(1, "Who is this invoice for?").max(80),
  clientEmail: z.union([z.literal(""), z.email("That email does not look right")]).optional(),
  currency: z.enum(CURRENCY_CODES),
  items: z.array(Item).min(1, "Add at least one line item").max(30),
  note: z.string().trim().max(500).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

export const POST = handle(async (req: Request) => {
  const address = await getSessionAddress();
  if (!address) return fail("Please sign in first.", 401);
  const body = Body.parse(await req.json());
  if (computeTotal(body.items) <= 0) return fail("The invoice total must be more than 0.");
  const db = await getDb();
  const [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  if (!merchant?.name) return fail("Add your name in Settings first, so clients know who is billing them.");
  const inv = await createInvoice({
    merchantAddress: address,
    merchantName: merchant.name,
    merchantEvmAddress: merchant.evmAddress,
    clientName: body.clientName,
    clientEmail: body.clientEmail || null,
    items: body.items,
    currency: body.currency,
    note: body.note || null,
    dueDate: body.dueDate || null,
  });
  return json({ invoice: publicInvoice(inv) }, 201);
});
