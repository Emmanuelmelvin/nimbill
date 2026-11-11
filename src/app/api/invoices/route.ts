import { eq } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { computeTotal, createInvoice, listInvoices, publicInvoice, reconcileMerchant } from "@/lib/invoices";
import { saveClient } from "@/lib/clients-book";
import { invoiceUsd, prepareLedger } from "@/lib/ledger";
import { metrics } from "@/lib/observability";
import { NewInvoiceBody } from "@/lib/schemas";

// Dashboard: my invoices. Also picks up payments we haven't seen yet.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileMerchant(address);
  // After reconciling, so a payment found just now gets its dollar value too.
  const { fx, currency } = await prepareLedger(address);
  const invoices = await listInvoices(address);
  return json({
    // `usd` lets the browser add up invoices in different currencies (clients view).
    invoices: invoices.map((i) => ({ ...publicInvoice(i), clientEmail: i.clientEmail, usd: invoiceUsd(i, fx) })),
    fx,
    currency,
  });
});

export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = NewInvoiceBody.parse(await req.json());
  if (computeTotal(body.items) <= 0) throw Errors.validation("The invoice total must be more than 0.");
  const db = await getDb();
  const [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  if (!merchant?.name) throw Errors.badRequest("Add your name in Settings first, so clients know who is billing them.");
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
  if (body.saveClient) await saveClient(address, { name: body.clientName, email: body.clientEmail || null });
  metrics.invoiceCreated(inv.currency);
  return json({ invoice: publicInvoice(inv) }, 201);
});
