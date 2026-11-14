// How a program (an AI agent, a script, a shop backend) pays a NimBill board.
// One source for the board API's `howToPay`, /llms.txt and the /ai page,
// so the three never disagree. Shared by the server and the browser.

export type AgentStep = {
  title: string;
  method?: "GET" | "POST";
  /** Path with {placeholders}; made absolute with the site's origin where it is shown. */
  path?: string;
  body?: Record<string, unknown>;
  /** What to do and what comes back. */
  text: string;
};

export const AGENT_STEPS: AgentStep[] = [
  {
    title: "Read the board",
    method: "GET",
    path: "/api/pay/{tag}",
    text: "Who you are paying (merchant.name, merchant.handle), whether any amount is accepted (merchant.openAmounts), which coins are accepted (NIM always, USDT when merchant.acceptsUsdt) and the products for sale with their id, name, price and currency.",
  },
  {
    title: "Create the invoice",
    method: "POST",
    path: "/api/pay/{tag}/invoices",
    body: { productId: "<a product id>", quantity: 1, payerName: "<who is paying, shown to the merchant>" },
    text: 'To pay an amount instead of buying a product (only when merchant.openAmounts is true), send { "amount": 25, "currency": "USD", "description": "<what it is for>", "payerName": "…" }. The answer is { invoice } with invoice.id and invoice.total in invoice.currency.',
  },
  {
    title: "Lock the price",
    method: "POST",
    path: "/api/invoices/{invoiceId}/quote",
    body: { asset: "NIM" },
    text: 'Use "USDT" to pay in USDT on Polygon. The answer is { quote } with amount (smallest units: Luna for NIM, 1 NIM = 100000 Luna; 6 decimals for USDT), recipient, memo and expiresAt. The price holds for 5 minutes; ask for a new quote if it runs out.',
  },
  {
    title: "Send the payment",
    text: "NIM: send a basic transaction of exactly quote.amount Luna to quote.recipient with quote.memo as the transaction data (UTF-8). The memo is how the payment is matched, so it is required. USDT: send an ERC-20 transfer of exactly quote.amount on Polygon to quote.recipient. USDT can't carry a memo, so the exact amount is what identifies the invoice: don't round it. Send before quote.expiresAt.",
  },
  {
    title: "Confirm it",
    method: "POST",
    path: "/api/invoices/{invoiceId}/verify",
    body: { asset: "NIM", txHash: "<transaction hash>" },
    text: 'Poll every few seconds. status is "pending" until the transaction is in a block, then "paid" with the updated invoice (and its invoice.payment details), or "rejected" with a message. The invoice and its receipt stay at /i/{invoiceId}.',
  },
];

export const AGENT_RULES = [
  "No account or API key is needed. Every request and answer is JSON.",
  "Works from a browser on any site too (CORS is open on these endpoints). Requests from other sites never carry a NimBill sign-in.",
  "Errors come back as { error: { code, message } } with a matching HTTP status. message is safe to show to a person.",
  "Payments go wallet to wallet. NimBill never holds the money; it only checks the blockchain.",
  "Each transaction can pay only one invoice. A board accepts at most 30 new invoices every 10 minutes.",
  "payerName is shown to the merchant on their order. Say who you are acting for.",
];

/** Fill {tag} and the like, and put the site's origin in front. */
export function agentUrl(origin: string, path: string, values: Record<string, string> = {}): string {
  return origin + path.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
}

/** The steps as plain text, for /llms.txt. */
export function agentStepsText(origin: string, values: Record<string, string> = {}): string {
  return AGENT_STEPS.map((s, i) => {
    const call = s.method && s.path ? `\n   ${s.method} ${agentUrl(origin, s.path, values)}` : "";
    const body = s.body ? `\n   Body: ${JSON.stringify(s.body)}` : "";
    return `${i + 1}. ${s.title}${call}${body}\n   ${s.text}`;
  }).join("\n\n");
}
