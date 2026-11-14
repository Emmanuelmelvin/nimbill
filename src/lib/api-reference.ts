// The public NimBill API, described once. The /docs pages, /openapi.json, /skill.md and the
// copy-paste setups for AI tools (/ai) are all made from this file, so they can't disagree.
// Shared by the server and the browser.
import { AGENT_RULES, AGENT_STEPS, agentStepsText } from "./agent-docs";
import { CURRENCY_CODES } from "./currencies";

export type Field = {
  name: string;
  type: "string" | "number" | "integer";
  required?: boolean;
  enum?: readonly string[];
  description: string;
};

export type Endpoint = {
  id: string; // OpenAPI operationId and page anchor
  method: "GET" | "POST";
  path: string;
  summary: string;
  /** Why you would call it. */
  why: string;
  params?: Field[]; // path and query parameters
  query?: Field[];
  body?: Field[];
  example: { request?: unknown; response: unknown };
  errors: string[];
};

const ASSET = ["NIM", "USDT"] as const;

export const ENDPOINTS: Endpoint[] = [
  {
    id: "getBoard",
    method: "GET",
    path: "/api/pay/{tag}",
    summary: "Read a board",
    why: "Start here. Shows who you're paying, what they sell, whether you may pay any amount, which coins they take, and the exact next steps with this board's URLs filled in.",
    params: [{ name: "tag", type: "string", required: true, description: "The tag, with or without @nimbill: ada or ada@nimbill." }],
    example: {
      response: {
        merchant: {
          tag: "ada",
          handle: "ada@nimbill",
          name: "Ada Studio",
          bio: "Brand designer, Lagos",
          address: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
          acceptsUsdt: true,
          openAmounts: true,
          avatarUrl: "/api/avatars/ada?v=1",
        },
        products: [
          {
            id: "g3exvt33mh",
            name: "Logo pack",
            description: "3 concepts, 2 rounds of changes",
            price: "120000.00",
            currency: "NGN",
            imageUrl: "/api/products/g3exvt33mh/image?v=1",
          },
        ],
        howToPay: { assets: ["NIM", "USDT"], steps: ["…5 steps with URLs…"], rules: ["…"], docs: "https://…/docs" },
      },
    },
    errors: ["404 NOT_FOUND: no one has that tag"],
  },
  {
    id: "createBoardInvoice",
    method: "POST",
    path: "/api/pay/{tag}/invoices",
    summary: "Create an invoice on a board",
    why: "Turns “I want to buy this” or “I want to pay 25 USD for that” into an invoice the merchant will recognise. Send a productId to buy a product, or amount + currency + description to pay any amount (only when merchant.openAmounts is true).",
    params: [{ name: "tag", type: "string", required: true, description: "The board's tag." }],
    body: [
      {
        name: "payerName",
        type: "string",
        required: true,
        description: "Who is paying. The merchant sees it on the order. Agents: say who you act for, e.g. “Shop bot for Tunde”.",
      },
      { name: "productId", type: "string", description: "A product id from the board. Use this or amount." },
      { name: "quantity", type: "integer", description: "How many of the product, 1 to 100. Default 1." },
      { name: "amount", type: "number", description: "Amount to pay when not buying a product." },
      { name: "currency", type: "string", enum: CURRENCY_CODES, description: "Currency of amount, e.g. USD, NGN, EUR." },
      { name: "description", type: "string", description: "What the amount is for, up to 120 characters." },
    ],
    example: {
      request: { productId: "g3exvt33mh", quantity: 2, payerName: "Shop bot for Tunde" },
      response: {
        invoice: {
          id: "89mwch33sp",
          number: "NMN-89MWC-H33SP",
          merchantName: "Ada Studio",
          clientName: "Shop bot for Tunde",
          items: [{ description: "Logo pack", quantity: 2, unitPrice: 120000 }],
          currency: "NGN",
          total: "240000.00",
          status: "unpaid",
          memo: "NimBill 89mwch33sp",
        },
      },
    },
    errors: [
      "400 VALIDATION: a field is missing or wrong (the message says which)",
      "400 BAD_REQUEST: the board doesn't take open amounts",
      "404 NOT_FOUND: no such tag, or the product isn't available",
      "429 RATE_LIMITED: more than 30 invoices on this board in 10 minutes",
    ],
  },
  {
    id: "getInvoice",
    method: "GET",
    path: "/api/invoices/{id}",
    summary: "Read an invoice",
    why: "See an invoice's total and status at any time. Once paid, invoice.payment has the coin, amount, rate and transaction hash. It also finds payments sent without a verify call.",
    params: [{ name: "id", type: "string", required: true, description: "The invoice id." }],
    example: {
      response: {
        invoice: {
          id: "89mwch33sp",
          number: "INV-0042",
          status: "paid",
          total: "240000.00",
          currency: "NGN",
          payment: { asset: "NIM", amount: "75266000", rate: "0.31886", txHash: "8f3c…a91e", paidAt: "2026-11-12T19:20:04.000Z" },
        },
        isOwner: false,
      },
    },
    errors: ["404 NOT_FOUND: no invoice with that id"],
  },
  {
    id: "createQuote",
    method: "POST",
    path: "/api/invoices/{id}/quote",
    summary: "Lock the price",
    why: "Converts the invoice total into an exact coin amount at the live rate (rounded up, so the merchant never gets less) and holds it for 5 minutes. It also tells you where to send it and the memo to attach.",
    params: [{ name: "id", type: "string", required: true, description: "The invoice id." }],
    body: [
      {
        name: "asset",
        type: "string",
        required: true,
        enum: ASSET,
        description: "NIM, or USDT on Polygon (only if the merchant accepts it).",
      },
      { name: "tip", type: "number", description: "Optional extra on top, in the invoice currency." },
    ],
    example: {
      request: { asset: "NIM" },
      response: {
        quote: {
          id: "q1x…",
          asset: "NIM",
          amount: "75266000",
          rate: "0.31886",
          tip: "0.00",
          expiresAt: "2026-11-12T19:25:00.000Z",
          recipient: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
          memo: "NimBill 89mwch33sp",
        },
      },
    },
    errors: ["400 BAD_REQUEST: already paid, cancelled, or USDT not accepted", "503 UPSTREAM: live prices unavailable, try again shortly"],
  },
  {
    id: "verifyPayment",
    method: "POST",
    path: "/api/invoices/{id}/verify",
    summary: "Confirm the payment",
    why: "After sending, report the transaction hash. NimBill reads it from the blockchain and checks the recipient, the amount, the memo and the time before marking the invoice paid. Poll every few seconds until it isn't pending.",
    params: [{ name: "id", type: "string", required: true, description: "The invoice id." }],
    body: [
      { name: "asset", type: "string", required: true, enum: ASSET, description: "The coin you paid with." },
      {
        name: "txHash",
        type: "string",
        required: true,
        description: "The transaction hash: 64 hex characters for NIM, 0x + 64 for Polygon.",
      },
    ],
    example: {
      request: { asset: "NIM", txHash: "8f3c…a91e" },
      response: { status: "paid", invoice: { id: "89mwch33sp", number: "INV-0042", status: "paid" } },
    },
    errors: [
      "status “pending”: not in a block yet, ask again",
      "status “rejected”: the transaction doesn't pay this invoice (message says why)",
    ],
  },
  {
    id: "lookupTag",
    method: "GET",
    path: "/api/tags/{tag}",
    summary: "Look up a tag",
    why: "Check who owns a tag before money moves: their name, wallet address and whether they take USDT.",
    params: [{ name: "tag", type: "string", required: true, description: "The tag, with or without @nimbill." }],
    example: {
      response: {
        owner: {
          tag: "ada",
          handle: "ada@nimbill",
          name: "Ada Studio",
          address: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
          acceptsUsdt: true,
          avatarUrl: "/api/avatars/ada?v=1",
        },
      },
    },
    errors: ["404 NOT_FOUND: no one has that tag"],
  },
  {
    id: "getRates",
    method: "GET",
    path: "/api/rates",
    summary: "Live prices",
    why: "Price of 1 NIM and 1 USDT in a currency, to show estimates before creating an invoice. Quotes use the same prices.",
    query: [{ name: "currency", type: "string", enum: CURRENCY_CODES, description: "Fiat currency code. Default USD." }],
    example: { response: { currency: "NGN", rates: { NIM: 0.31886, USDT: 1345.7 } } },
    errors: ["400 VALIDATION: unsupported currency", "503 UPSTREAM: live prices unavailable"],
  },
];

// ---------- copy-paste setups for AI tools ----------

const safety = `## Before you send money
- Show the person who is being paid (merchant name and handle), what for, the total in their currency and the exact coin amount. Get a clear yes first.
- Never send more than the quote, never after quote.expiresAt, and never to an address other than quote.recipient.
- If you can't sign transactions yourself, don't ask for keys or seed phrases. Give the person the invoice link {origin}/i/{invoiceId} to pay in Nimiq Pay, or the payment link nimiq:{recipient without spaces}?amount={NIM}&message={memo, URL-encoded}.`;

/** A Claude Agent Skill (SKILL.md). Also works as plain instructions for any agent. */
export function skillMarkdown(origin: string): string {
  return `---
name: nimbill-pay
description: Pay someone on NimBill in NIM or USDT. Use when asked to pay a NimBill tag (like ada@nimbill), a NimBill pay link (${origin}/pay/…), a NimBill invoice, or to buy a product from a NimBill board.
---

# Pay with NimBill

NimBill users have a tag like ada@nimbill and a public board at ${origin}/pay/{tag}. Anyone can pay a board with plain HTTP and JSON. No account or API key. Replace {tag} with the part before @nimbill.

## Steps

${agentStepsText(origin)}

${safety.replaceAll("{origin}", origin)}

## Rules

${AGENT_RULES.map((r) => `- ${r}`).join("\n")}

Full reference: ${origin}/docs · OpenAPI: ${origin}/openapi.json
`;
}

/** A Cursor project rule, for developers building NimBill payments into their own code. */
export function cursorRule(origin: string): string {
  return `---
description: NimBill payments API (pay links, invoices, on-chain verification). Use when adding NimBill payments to this codebase.
alwaysApply: false
---

# NimBill API

Base URL: ${origin}. JSON in and out, no API key. Errors are { error: { code, message } } with a matching HTTP status.
OpenAPI spec: ${origin}/openapi.json

## Endpoints
${ENDPOINTS.map((e) => `- ${e.method} ${e.path}: ${e.summary}. ${e.why}`).join("\n")}

## Payment flow
${AGENT_STEPS.map((s, i) => `${i + 1}. ${s.title}${s.method ? ` (${s.method} ${s.path})` : ""}: ${s.text}`).join("\n")}

## Implementation notes
- Amounts in quotes are strings in the smallest unit (Luna for NIM: 1 NIM = 100000; 6 decimals for USDT). Use BigInt, never floats.
- Poll verify every 3 to 5 seconds, for up to about 3 minutes. Treat "rejected" as final.
- Never trust a transaction hash on your side alone: the invoice is paid only when verify (or GET /api/invoices/{id}) says status "paid".
`;
}

/** Instructions for a ChatGPT custom GPT, Grok, Gemini or any chat assistant. */
export function chatInstructions(origin: string): string {
  return `You can pay people on NimBill (${origin}). A NimBill tag looks like ada@nimbill; its board is ${origin}/pay/ada and its data is at ${origin}/api/pay/ada.

When asked to pay a tag, a pay link or a NimBill invoice:
1. Read the board (GET ${origin}/api/pay/{tag}) and tell me who it is, what they sell and what they accept.
2. Create the invoice (POST ${origin}/api/pay/{tag}/invoices) with a productId and quantity, or an amount, currency and description, plus payerName.
3. Lock the price (POST ${origin}/api/invoices/{id}/quote with asset NIM or USDT).
4. Show me the merchant, the total and the exact coin amount, and wait for my OK.
5. You can't send crypto yourself: give me the invoice link ${origin}/i/{id} to pay in Nimiq Pay.
6. When I say I've paid, check GET ${origin}/api/invoices/{id} until status is "paid".

Never ask for my keys or seed phrase. Full guide: ${origin}/llms.txt`;
}

// ---------- OpenAPI ----------

function schemaFor(f: Field) {
  return { type: f.type, description: f.description, ...(f.enum ? { enum: [...f.enum] } : {}) };
}

/** An OpenAPI 3.1 description of the public API, for ChatGPT actions and code generators. */
export function openApiSpec(origin: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const parameters = [
      ...(e.params ?? []).map((p) => ({ name: p.name, in: "path", required: true, schema: schemaFor(p), description: p.description })),
      ...(e.query ?? []).map((p) => ({
        name: p.name,
        in: "query",
        required: !!p.required,
        schema: schemaFor(p),
        description: p.description,
      })),
    ];
    paths[e.path] = {
      ...paths[e.path],
      [e.method.toLowerCase()]: {
        operationId: e.id,
        summary: e.summary,
        description: e.why,
        ...(parameters.length ? { parameters } : {}),
        ...(e.body
          ? {
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: e.body.filter((f) => f.required).map((f) => f.name),
                      properties: Object.fromEntries(e.body.map((f) => [f.name, schemaFor(f)])),
                    },
                    example: e.example.request,
                  },
                },
              },
            }
          : {}),
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: { type: "object" }, example: e.example.response } } },
          default: {
            description: e.errors.join("; "),
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } } },
                },
              },
            },
          },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "NimBill",
      version: "1.0.0",
      description:
        "Pay NimBill users in NIM or USDT: read a board, create an invoice, lock the price, send the payment from a wallet, then confirm it on-chain. No API key. NimBill never holds funds.",
    },
    servers: [{ url: origin }],
    paths,
  };
}
