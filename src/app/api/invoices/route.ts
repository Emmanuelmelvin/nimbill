import { eq } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { computeTotal, createInvoice, listInvoices, publicInvoice, reconcileMerchant } from "@/lib/invoices";
import { saveClient } from "@/lib/clients-book";
import { invoiceUsd, prepareLedger } from "@/lib/ledger";
import { logger } from "@/lib/logger";
import { metrics } from "@/lib/observability";
import { advanceDueRecurring, createRecurringInvoice, listRecurringInvoices, publicRecurringInvoice } from "@/lib/recurring";
import { NewInvoiceBody } from "@/lib/schemas";

// Dashboard: my invoices. Also generates any due recurring invoices and picks up payments we haven't seen yet.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  // Best effort: the worker issues due cycles too, so a failure here must never break the dashboard.
  await advanceDueRecurring(address).catch((e: Error) =>
    logger.warn("recurring advance on dashboard load failed", { merchant: address, error: e.message }),
  );
  await reconcileMerchant(address);
  // After reconciling, so a payment found just now gets its dollar value too.
  const { fx, currency } = await prepareLedger(address);
  const [invoices, recurring] = await Promise.all([listInvoices(address), listRecurringInvoices(address)]);
  return json({
    // `usd` lets the browser add up invoices in different currencies (clients view).
    // `viewedAt`: when the client first opened it (private, like `clientEmail`).
    invoices: invoices.map((i) => ({
      ...publicInvoice(i),
      clientEmail: i.clientEmail,
      viewedAt: i.viewedAt?.toISOString() ?? null,
      usd: invoiceUsd(i, fx),
    })),
    recurring: recurring.map(publicRecurringInvoice),
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

  if (body.recurring) {
    const { recurring, invoice } = await createRecurringInvoice({
      merchantAddress: address,
      merchantName: merchant.name,
      merchantEvmAddress: merchant.evmAddress,
      clientName: body.clientName,
      clientEmail: body.clientEmail || null,
      items: body.items,
      currency: body.currency,
      note: body.note || null,
      interval: body.recurring.interval,
      dueDays: body.recurring.dueDays,
      startDate: body.recurring.startDate || null,
    });
    if (body.saveClient) await saveClient(address, { name: body.clientName, email: body.clientEmail || null });
    return json(
      {
        invoice: invoice ? publicInvoice(invoice) : null,
        recurring: publicRecurringInvoice(recurring),
      },
      201,
    );
  }

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
  return json({ invoice: publicInvoice(inv), recurring: null }, 201);
});
