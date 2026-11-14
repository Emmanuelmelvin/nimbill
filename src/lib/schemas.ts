// Request schemas shared by API routes and the browser forms that send them,
// so both sides check the same rules with the same messages.
import { z } from "zod";
import { isValidPointHex } from "./cheque-crypto";
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

/** The most a client can add as a tip, in the invoice currency. */
export const MAX_TIP = 1e9;

export const QuoteBody = z.object({
  asset: AssetInput,
  /** Optional tip on top of the invoice total, in the invoice currency. Kept to 2 decimals. */
  tip: z.coerce
    .number("Enter the tip as a number")
    .min(0, "A tip can't be negative")
    .max(MAX_TIP, "That tip is too large")
    .default(0)
    .transform((n) => Math.round(n * 100) / 100),
});

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

/**
 * Start a transfer to someone's tag. `asset` is the coin sent (NIM unless given). The amount is in
 * `currency`: a fiat code, or the coin itself. USDT needs the sender's Polygon address (`fromEvmAddress`),
 * because a USDT transfer has no memo and the server matches it by both wallets and the exact amount.
 */
export const NewTransferBody = z
  .object({
    to: z.string().trim().min(1, "Who are you sending to?").max(60),
    asset: z.enum(["NIM", "USDT"], { error: "Send NIM or USDT" }).default("NIM"),
    amount: z.coerce.number("Enter the amount as a number").positive("Enter an amount above 0").max(1e12, "That amount is too large"),
    currency: z.enum([...CURRENCY_CODES, "NIM", "USDT"], { error: "Unsupported currency" }),
    fromEvmAddress: z
      .string()
      .trim()
      .regex(/^0x[0-9a-fA-F]{40}$/, "That isn't a Polygon address")
      .optional(),
    note: z.string().trim().max(80, "Keep the note under 80 characters").optional(),
  })
  .refine((b) => (b.currency !== "NIM" && b.currency !== "USDT") || b.currency === b.asset, {
    message: "Type the amount in a currency or in the coin you're sending",
    path: ["currency"],
  })
  .refine((b) => b.asset !== "USDT" || !!b.fromEvmAddress, {
    message: "Sending USDT needs your wallet's Polygon address",
    path: ["fromEvmAddress"],
  });
export type NewTransferInput = z.input<typeof NewTransferBody>;

export const TransferVerifyBody = z.object({ txHash: z.string().trim().max(80) });

/** Most products one merchant can list. */
export const MAX_PRODUCTS = 50;
/** Largest product picture accepted, after the browser has shrunk it. */
export const MAX_IMAGE_BYTES = 400_000;
/** Pictures are shrunk to at most this many pixels on their longest side before upload. */
export const IMAGE_MAX_SIDE = 1000;

export const ProductBody = z.object({
  name: z.string().trim().min(1, "Give the product a name").max(80, "Keep the name under 80 characters"),
  description: z.string().trim().max(500, "Keep the description under 500 characters").optional(),
  price: z.coerce.number("Enter the price as a number").positive("The price must be more than 0").max(1e12, "That price is too large"),
  currency: z.enum(CURRENCY_CODES, { error: "Unsupported currency" }),
  active: z.boolean().optional(),
});
export type ProductInput = z.input<typeof ProductBody>;
/** For edits: every field optional, only what is sent changes. */
export const ProductPatchBody = ProductBody.partial();

/** A product picture as a data URL ("data:image/jpeg;base64,…"). */
export const ProductImageBody = z.object({
  dataUrl: z
    .string()
    .max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 100, "That picture is too large. Try a smaller one.")
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/, "Use a JPEG, PNG or WebP picture."),
});

/**
 * A visitor starting a payment on a merchant's board: either buying a product, or paying an amount
 * they type with what it's for (only when the merchant accepts open payments).
 */
export const BoardInvoiceBody = z
  .object({
    payerName: z
      .string({ error: "Enter your name, so they know who paid" })
      .trim()
      .min(1, "Enter your name, so they know who paid")
      .max(80),
    productId: z.string().trim().max(20).optional(),
    quantity: z.coerce.number().int("Quantity must be a whole number").min(1).max(100).optional(),
    amount: z.coerce
      .number("Enter the amount as a number")
      .positive("Enter an amount above 0")
      .max(1e12, "That amount is too large")
      .optional(),
    currency: z.enum(CURRENCY_CODES, { error: "Unsupported currency" }).optional(),
    description: z.string().trim().min(1, "Say what you're paying for").max(120).optional(),
    // "Pay with NimBill": only accepted on requests signed with the merchant's webhook secret.
    reference: z.string().trim().min(1).max(100, "Keep reference under 100 characters").optional(),
    metadata: z
      .record(
        z.string().min(1).max(40, "metadata keys must be 40 characters or less"),
        z.string().max(500, "metadata values must be 500 characters or less"),
      )
      .refine((m) => Object.keys(m).length <= 20, "metadata can have at most 20 keys")
      .optional(),
    returnUrl: z.string().trim().max(1000, "returnUrl is too long").optional(),
  })
  .refine(
    (b) => b.productId || (b.amount !== undefined && b.currency && b.description),
    "Pick a product, or enter an amount and what it's for",
  );
export type BoardInvoiceInput = z.input<typeof BoardInvoiceBody>;

export const ClientBody = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(80),
  email: z.union([z.literal(""), z.email("That email does not look right")]).optional(),
});

/** Write a cheque: either for a specific person's @tag, or a free cheque for the first person to claim. */
export const NewChequeBody = z.object({
  amount: z.coerce.number("Enter the amount as a number").positive("Enter an amount above 0").max(1e12, "That amount is too large"),
  currency: z.enum([...CURRENCY_CODES, "NIM"], { error: "Unsupported currency" }),
  linkPublicKey: z.string().refine(isValidPointHex, "Invalid cheque public key"),
  recipientTag: z.string().trim().max(60).nullish(),
  note: z.string().trim().max(80, "Keep the note under 80 characters").optional(),
});
export type NewChequeInput = z.input<typeof NewChequeBody>;

export const ChequeVerifyBody = z.object({ txHash: z.string().trim().max(80).optional() });

const ClaimCommon = {
  action: z.enum(["cash", "cancel"]),
  recipientAddress: z.string().trim().min(1, "Enter the Nimiq address to receive the funds").max(60),
  claimerName: z.string().trim().max(80).optional(),
  validityStartHeight: z.coerce.number().int().positive().max(0xffffffff),
  /** Luna moved out of the cheque: its whole on-chain balance (`balance` from GET /api/cheques/[id]). */
  value: z.string().regex(/^[1-9][0-9]{0,18}$/, "Invalid amount"),
};

export const ChequeClaimBody = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("prepare"),
    ...ClaimCommon,
    clientNoncePublicKey: z.string().refine(isValidPointHex, "Invalid nonce public key"),
  }),
  z.object({
    step: z.literal("broadcast"),
    ...ClaimCommon,
    rawTx: z.string().regex(/^[0-9a-f]{278}$/i, "Invalid signed transaction"),
  }),
]);
