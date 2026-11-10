// Request schemas shared by API routes and the browser forms that send them,
// so both sides check the same rules with the same messages.
import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";

export const LineItemInput = z.object({
  description: z.string().trim().min(1, "Each line needs a description").max(120),
  quantity: z.coerce.number().positive("Quantity must be more than 0").max(100000),
  unitPrice: z.coerce.number().positive("Price must be more than 0").max(1e12),
});

export const NewInvoiceBody = z.object({
  clientName: z.string().trim().min(1, "Who is this invoice for?").max(80),
  clientEmail: z.union([z.literal(""), z.email("That email does not look right")]).optional(),
  currency: z.enum(CURRENCY_CODES),
  items: z.array(LineItemInput).min(1, "Add at least one line item").max(30),
  note: z.string().trim().max(500).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid due date")
    .optional()
    .or(z.literal("")),
});
export type NewInvoiceInput = z.input<typeof NewInvoiceBody>;

export const AssetInput = z.enum(["NIM", "USDT"]);

export const QuoteBody = z.object({ asset: AssetInput });

export const VerifyBody = z.object({ asset: AssetInput, txHash: z.string().trim().max(80) });

export const RatesQuery = z.object({
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .default("USD")
    .pipe(z.enum(CURRENCY_CODES, { error: "Unsupported currency" })),
});
