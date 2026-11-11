// Request schemas shared by API routes and the browser forms that send them,
// so both sides check the same rules with the same messages.
import { z } from "zod";
import { CURRENCY_CODES } from "./currencies";
import { UNIT_CODES } from "./money";

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
  /** Remember this client (name and email) for the next invoice. */
  saveClient: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid due date")
    .optional()
    .or(z.literal("")),
});
export type NewInvoiceInput = z.input<typeof NewInvoiceBody>;

/**
 * The merchant's own email for "invoice paid" notifications. Optional: leaving it out keeps the
 * saved value, while "" or null clears it (which turns the emails off).
 */
export const MerchantEmail = z
  .string()
  .trim()
  .max(254, "That email is too long")
  .pipe(z.union([z.literal(""), z.email("That email does not look right")]))
  .nullable()
  .optional();

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

const DateInput = (message: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, message);

/** An earnings goal. `today` is the browser's local date, so "already ended" matches what the merchant sees. */
export const GoalBody = z
  .object({
    title: z.string().trim().min(1, "Give your goal a name").max(60),
    targetAmount: z.coerce.number().positive("The target must be more than 0").max(1e12),
    currency: z.enum(UNIT_CODES, { error: "Unsupported currency" }),
    startDate: DateInput("Pick a valid start date"),
    endDate: DateInput("Pick a valid end date"),
    today: DateInput("Invalid date"),
  })
  .refine((g) => g.endDate >= g.startDate, "The end date must be after the start date")
  .refine((g) => Date.parse(g.endDate) - Date.parse(g.startDate) <= 5 * 366 * 86_400_000, "A goal can run for up to 5 years")
  // The browser's date can be a day ahead of or behind the server's, never more.
  .refine((g) => Math.abs(Date.parse(g.today) - Date.now()) < 2 * 86_400_000, "Your device's date looks wrong");
export type GoalBodyInput = z.input<typeof GoalBody>;

export const ExportQuery = z.object({ range: z.enum(["30d", "90d", "1y", "all"]).default("all") });

export const ClientBody = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(80),
  email: z.union([z.literal(""), z.email("That email does not look right")]).optional(),
});
