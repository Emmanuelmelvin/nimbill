// The MCP Agent Wallet's tools and example prompts, shown on the /mcp pages and in the docs search.
// The package name, version and Node version come from the published package's own manifest,
// so what the docs say never drifts from npm.
import type { Field } from "@/lib/api-reference";
import mcpPackage from "../../../mcp/package.json";

export const PKG = mcpPackage.name;
export const PKG_VERSION = mcpPackage.version;
export const NPM_URL = `https://www.npmjs.com/package/${PKG}`;
export const NODE_MIN = mcpPackage.engines.node.replace(/^>=\s*/, "");

export type ToolCategory = "Wallet & Identity" | "Paying & Sending" | "Cheques" | "Invoicing";
export const TOOL_CATEGORIES: ToolCategory[] = ["Wallet & Identity", "Paying & Sending", "Cheques", "Invoicing"];

export type ToolDoc = {
  name: string;
  category: ToolCategory;
  summary: string;
  description: string;
  fields?: Field[];
  exampleCall: Record<string, unknown>;
  exampleResult: unknown;
};

export const TOOLS: ToolDoc[] = [
  {
    name: "wallet_status",
    category: "Wallet & Identity",
    summary: "Check the agent's NQ… address, live NIM balance, and @tag profile",
    description:
      "Signs in to NimBill automatically with the agent's Ed25519 keypair, queries the Nimiq blockchain for its live NIM balance, and returns the agent's address, public key, and NimBill profile.",
    exampleCall: {},
    exampleResult: {
      address: "NQ16 KRF9 5C6V 395Q AK21 CM01 P6HM HUE4 RPGS",
      publicKey: "e26b57d8e5f86ec9dce235fd9da5b3b13ab5d7102bb8ae370de98bf8c104a668",
      walletSource: "~/.nimbill/agent-wallet.json",
      balance: { nim: 250, luna: "25000000", formatted: "250 NIM" },
      profile: {
        name: "Ada AI Agent",
        tag: "ada_agent",
        handle: "ada_agent@nimbill",
        boardUrl: "https://nimbill.app/pay/ada_agent",
        displayCurrency: "USD",
      },
    },
  },
  {
    name: "setup_profile",
    category: "Wallet & Identity",
    summary: "Set the agent's display name, bio, currency, and claim its @tag",
    description:
      "Configures the agent's NimBill merchant account and claims a public @tag (like ada_agent@nimbill) so people or other agents can pay it by tag or on its public board.",
    fields: [
      { name: "name", type: "string", required: true, description: "Display name shown on invoices, cheques, and your board." },
      { name: "tag", type: "string", description: "NimBill tag to claim (3–20 lowercase letters, digits, or single underscores)." },
      { name: "bio", type: "string", description: "Short bio shown on the agent's public pay board (up to 160 chars)." },
      { name: "defaultCurrency", type: "string", description: "3-letter display currency code (e.g. USD, NGN, EUR)." },
    ],
    exampleCall: {
      name: "Ada AI Agent",
      tag: "ada_agent",
      bio: "Autonomous design & billing assistant",
      defaultCurrency: "USD",
    },
    exampleResult: {
      merchant: {
        address: "NQ16 KRF9 5C6V 395Q AK21 CM01 P6HM HUE4 RPGS",
        name: "Ada AI Agent",
        tag: "ada_agent",
        bio: "Autonomous design & billing assistant",
        displayCurrency: "USD",
      },
      handle: "ada_agent@nimbill",
      boardUrl: "https://nimbill.app/pay/ada_agent",
    },
  },
  {
    name: "lookup_tag",
    category: "Wallet & Identity",
    summary: "Resolve any @tag to its owner's name, Nimiq address, and avatar",
    description: "Checks who owns a NimBill tag before sending money, writing a tag-locked cheque, or paying a board.",
    fields: [{ name: "tag", type: "string", required: true, description: "The NimBill tag to look up (e.g. 'ada' or 'ada@nimbill')." }],
    exampleCall: { tag: "ada@nimbill" },
    exampleResult: {
      owner: {
        tag: "ada",
        handle: "ada@nimbill",
        name: "Ada Studio",
        address: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
        avatarUrl: "/api/avatars/ada?v=1",
      },
    },
  },
  {
    name: "get_rates",
    category: "Wallet & Identity",
    summary: "Live NIM and USDT prices in 19 supported local currencies",
    description: "Fetches the current CoinGecko exchange rates used by NimBill quotes.",
    fields: [{ name: "currency", type: "string", description: "3-letter fiat currency code (default: 'USD')." }],
    exampleCall: { currency: "NGN" },
    exampleResult: { currency: "NGN", rates: { NIM: 1.85, USDT: 1610.5 } },
  },
  {
    name: "get_board",
    category: "Paying & Sending",
    summary: "Read a merchant's public pay board (/pay/<tag>) and products",
    description:
      "Returns the merchant's profile, listed products with prices, whether open amounts are accepted, and step-by-step payment instructions.",
    fields: [{ name: "tag", type: "string", required: true, description: "The merchant's @tag." }],
    exampleCall: { tag: "ada" },
    exampleResult: {
      merchant: {
        tag: "ada",
        handle: "ada@nimbill",
        name: "Ada Studio",
        address: "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
        openAmounts: true,
      },
      products: [{ id: "g3exvt33mh", name: "Logo pack", price: "120000.00", currency: "NGN" }],
    },
  },
  {
    name: "buy_from_board",
    category: "Paying & Sending",
    summary: "Create an order on /pay/<tag> and pay it on-chain in one step",
    description:
      "Creates an invoice on a merchant's public board (either buying a product by productId or paying an open amount), locks a 5-minute NIM quote, signs and broadcasts the Extended Nimiq transaction with the 'NimBill <id>' memo, and verifies it on-chain.",
    fields: [
      { name: "tag", type: "string", required: true, description: "The merchant's @tag." },
      { name: "payerName", type: "string", required: true, description: "Who is paying (e.g. 'Agent for Tunde')." },
      { name: "productId", type: "string", description: "Product ID from get_board when buying a product." },
      { name: "quantity", type: "integer", description: "Quantity of the product (1–100, default 1)." },
      { name: "amount", type: "number", description: "Amount when paying an open amount." },
      { name: "currency", type: "string", description: "Currency code for an open amount (e.g. USD, NGN)." },
      { name: "description", type: "string", description: "What the open amount is for." },
      {
        name: "payNow",
        type: "string",
        description: "Boolean (default false): only create the invoice. Set true to pay it on-chain right away (spending limits apply).",
      },
    ],
    exampleCall: { tag: "ada", productId: "g3exvt33mh", quantity: 1, payerName: "Agent for Tunde" },
    exampleResult: {
      invoice: { id: "89mwch33sp", number: "NMN-89MWC-H33SP", total: "120000.00", currency: "NGN" },
      payment: {
        txHash: "73e7ca24ac6645601c7c13a03f81d942a0489950018ea5074be41c6ed4a59201",
        explorerUrl: "https://nimiq.watch/#73e7ca24ac6645601c7c13a03f81d942a0489950018ea5074be41c6ed4a59201",
        amountNim: 648.65,
        verificationStatus: "confirmed",
        receiptUrl: "https://nimbill.app/i/89mwch33sp/receipt",
      },
    },
  },
  {
    name: "get_invoice",
    category: "Paying & Sending",
    summary: "Read any NimBill invoice by ID, link, or NMN-… number",
    description: "Fetches the full public details of an invoice (merchant, line items, total, status, and payment receipt if paid).",
    fields: [{ name: "invoiceId", type: "string", required: true, description: "Invoice ID, URL, or NMN-XXXXX-XXXXX number." }],
    exampleCall: { invoiceId: "NMN-89MWC-H33SP" },
    exampleResult: {
      invoice: {
        id: "89mwch33sp",
        number: "INV-0004",
        nimbillNumber: "NMN-89MWC-H33SP",
        merchantName: "Ada Studio",
        total: "120000.00",
        currency: "NGN",
        status: "unpaid",
      },
      url: "https://nimbill.app/i/89mwch33sp",
    },
  },
  {
    name: "pay_invoice",
    category: "Paying & Sending",
    summary: "Pay an unpaid NimBill invoice on-chain from the agent's wallet",
    description:
      "Locks a 5-minute NIM price quote on the invoice, builds and signs a Nimiq Albatross Extended transaction with the 'NimBill <id>' memo, broadcasts it to the Nimiq network, and verifies the payment with NimBill.",
    fields: [
      { name: "invoiceId", type: "string", required: true, description: "Invoice ID, URL, or NMN-… number." },
      { name: "tip", type: "number", description: "Optional tip in the invoice's currency." },
      {
        name: "dryRun",
        type: "string",
        description: "Boolean. If true, locks the quote and signs the transaction locally without broadcasting.",
      },
    ],
    exampleCall: { invoiceId: "NMN-89MWC-H33SP" },
    exampleResult: {
      txHash: "73e7ca24ac6645601c7c13a03f81d942a0489950018ea5074be41c6ed4a59201",
      explorerUrl: "https://nimiq.watch/#73e7ca24ac6645601c7c13a03f81d942a0489950018ea5074be41c6ed4a59201",
      amountNim: 648.65,
      verificationStatus: "confirmed",
      invoiceUrl: "https://nimbill.app/i/89mwch33sp",
      receiptUrl: "https://nimbill.app/i/89mwch33sp/receipt",
    },
  },
  {
    name: "send_to_tag",
    category: "Paying & Sending",
    summary: "Send NIM to someone's @tag and verify on-chain",
    description:
      "Creates a tag transfer (denominated in NIM or any supported fiat currency), signs and broadcasts the on-chain Nimiq transaction with the 'NimBill TX <id>' memo, and verifies it.",
    fields: [
      { name: "to", type: "string", required: true, description: "Recipient's @tag (e.g. 'ada' or 'ada@nimbill')." },
      { name: "amount", type: "number", required: true, description: "Amount to send." },
      { name: "currency", type: "string", required: true, description: "'NIM' or a 3-letter fiat currency code like 'USD' or 'NGN'." },
      { name: "note", type: "string", description: "Optional short note (up to 80 characters)." },
    ],
    exampleCall: { to: "ada@nimbill", amount: 50, currency: "NIM", note: "Thanks for the icons" },
    exampleResult: {
      txHash: "a2b08ef31b57c8d90123456789abcdef0123456789abcdef0123456789abcdef",
      explorerUrl: "https://nimiq.watch/#a2b08ef31b57c8d90123456789abcdef0123456789abcdef0123456789abcdef",
      verificationStatus: "paid",
    },
  },
  {
    name: "write_cheque",
    category: "Cheques",
    summary: "Write and fund a non-custodial 2-of-2 cheque (free or locked to a @tag)",
    description:
      "Generates a 24-character cheque secret locally, derives the client half of the 2-of-2 Ed25519 key, registers the cheque on NimBill, funds the combined cheque address on-chain from the agent's wallet, and returns the shareable claim link and CHQ-… code.",
    fields: [
      { name: "amount", type: "number", required: true, description: "Cheque amount." },
      { name: "currency", type: "string", description: "'NIM' or a 3-letter fiat currency code (default: 'NIM')." },
      {
        name: "recipientTag",
        type: "string",
        description: "Optional @tag to lock the cheque to. Omit for a free cheque anyone can claim.",
      },
      { name: "note", type: "string", description: "Optional note shown on the face of the cheque." },
    ],
    exampleCall: { amount: 25, currency: "NIM", recipientTag: "tunde", note: "Bounty reward" },
    exampleResult: {
      cheque: {
        id: "hs8dufwz47",
        number: "CHQ-HS8DU-FWZ47",
        chequeAddress: "NQ42 8B1C 9K2M 7P4Q 3R5S 6T8V 1X2Y 4A5B 9C0D",
        amount: "2500000",
        status: "funded",
      },
      claimUrl: "https://nimbill.app/c/hs8dufwz47#ea6crpymwjmgr7pzgak2mjnd",
      chequeCode: "CHQ-HS8DU-FWZ47-EA6CRP-YMWJMG-R7PZGA-K2MJND",
      funding: { fundedOnChain: true, status: "funded" },
    },
  },
  {
    name: "cash_cheque",
    category: "Cheques",
    summary: "Cash a cheque link or CHQ-… code on-chain into the agent's wallet or any @tag",
    description:
      "Completes the 2-of-2 Ed25519 threshold signature with the NimBill server and broadcasts the 139-byte Basic transaction sweeping the cheque's NIM straight to the destination wallet. Works even when the agent's own wallet has 0 NIM!",
    fields: [
      {
        name: "cheque",
        type: "string",
        required: true,
        description: "Full cheque URL (with #<secret>) or full CHQ-XXXXX-XXXXX-XXXXXX-… code.",
      },
      {
        name: "toTagOrAddress",
        type: "string",
        description: "Optional @tag or NQ… address to receive the funds (defaults to the agent's wallet).",
      },
      { name: "claimerName", type: "string", description: "Optional name shown to the cheque writer." },
    ],
    exampleCall: { cheque: "CHQ-HS8DU-FWZ47-EA6CRP-YMWJMG-R7PZGA-K2MJND" },
    exampleResult: {
      cheque: { number: "CHQ-HS8DU-FWZ47", status: "cashed" },
      txHash: "6ea82e8a926cd8e3babb8f696e0cacf0c8df18ff5f0a25cee50e5d374284739a",
      explorerUrl: "https://nimiq.watch/#6ea82e8a926cd8e3babb8f696e0cacf0c8df18ff5f0a25cee50e5d374284739a",
      recipientAddress: "NQ16 KRF9 5C6V 395Q AK21 CM01 P6HM HUE4 RPGS",
    },
  },
  {
    name: "cancel_cheque",
    category: "Cheques",
    summary: "Cancel an uncashed cheque written by the agent and reclaim the NIM",
    description: "Co-signs a cancellation transaction returning the cheque's full NIM balance back to the agent's wallet.",
    fields: [{ name: "cheque", type: "string", required: true, description: "Full cheque URL (with #<secret>) or full CHQ-… code." }],
    exampleCall: { cheque: "CHQ-HS8DU-FWZ47-EA6CRP-YMWJMG-R7PZGA-K2MJND" },
    exampleResult: {
      cheque: { number: "CHQ-HS8DU-FWZ47", status: "cancelled" },
      txHash: "9f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a3210",
    },
  },
  {
    name: "list_cheques",
    category: "Cheques",
    summary: "List all cheques written by the agent",
    description: "Returns the status (pending, funded, cashed, cancelled) of cheques written by the agent.",
    exampleCall: {},
    exampleResult: {
      cheques: [{ id: "hs8dufwz47", number: "CHQ-HS8DU-FWZ47", status: "funded", amount: "2500000" }],
    },
  },
  {
    name: "create_invoice",
    category: "Invoicing",
    summary: "Create a new invoice so a client or another agent can pay you",
    description: "Creates an invoice in any of NimBill's 19 supported currencies and returns the shareable link and NMN-… number.",
    fields: [
      { name: "clientName", type: "string", required: true, description: "Client's name." },
      { name: "currency", type: "string", required: true, description: "3-letter currency code (e.g. USD, NGN, EUR)." },
      { name: "items", type: "string", required: true, description: "Array of { description, quantity, unitPrice } line items." },
      { name: "dueDate", type: "string", description: "Optional due date (YYYY-MM-DD)." },
      { name: "note", type: "string", description: "Optional note on the invoice." },
    ],
    exampleCall: {
      clientName: "Acme Corp",
      currency: "USD",
      items: [{ description: "Automated code review", quantity: 1, unitPrice: 25 }],
    },
    exampleResult: {
      invoice: { id: "rcj9442gkh", number: "INV-0001", nimbillNumber: "NMN-RCJ94-42GKH", total: "25.00", currency: "USD" },
      url: "https://nimbill.app/i/rcj9442gkh",
    },
  },
  {
    name: "list_invoices",
    category: "Invoicing",
    summary: "List all invoices created by the agent",
    description: "Returns the agent's invoices and their current on-chain payment status.",
    exampleCall: {},
    exampleResult: {
      invoices: [{ id: "rcj9442gkh", number: "INV-0001", clientName: "Acme Corp", total: "25.00", currency: "USD", status: "unpaid" }],
    },
  },
];

export const PROMPTS = [
  {
    title: "Check wallet & claim a tag",
    prompt: "Check your NimBill wallet status, then set your profile name to 'Studio Bot' and claim the tag studiobot@nimbill.",
  },
  {
    title: "Cash a cheque to fund the agent",
    prompt: "Cash this NimBill cheque into your wallet: CHQ-HS8DU-FWZ47-EA6CRP-YMWJMG-R7PZGA-K2MJND",
  },
  {
    title: "Buy from someone's public board",
    prompt: "Look up ada@nimbill's board, show me what she sells, and buy 1 Logo pack for Tunde.",
  },
  {
    title: "Send NIM to a tag",
    prompt: "Send $5 worth of NIM to chidi@nimbill with the note 'Coffee on me'.",
  },
  {
    title: "Write a cheque for a teammate or user",
    prompt: "Write a 50 NIM cheque locked to tunde@nimbill for 'Bug bounty' and give me the link and cheque code.",
  },
  {
    title: "Bill a client",
    prompt: "Create an invoice for 'Kemi Labs' for 45,000 NGN for 'Landing page copy' and give me the invoice link.",
  },
];

/** The MCP config entry most clients take (Claude Desktop, Cursor, Antigravity, Windsurf). */
export function mcpConfig(base: string) {
  return { mcpServers: { nimbill: { command: "npx", args: ["-y", PKG], env: { NIMBILL_URL: base } } } };
}

/** Paste into any agent that can run commands and edit its own MCP config. */
export function agentSetupPrompt(base: string): string {
  return [
    `Set up the NimBill Agent Wallet MCP server for yourself. It is published on npm as "${PKG}" (${NPM_URL}) and needs Node.js ${NODE_MIN} or newer.`,
    ``,
    `1. Check that \`node --version\` is ${NODE_MIN} or newer.`,
    `2. Register an MCP server named "nimbill" in this client's MCP config that runs \`npx -y ${PKG}\` with these environment variables:`,
    `   - NIMBILL_URL=${base}`,
    `   - NIMBILL_WALLET_PASSPHRASE=<ask me for a passphrase; never invent one>`,
    `3. Reload the MCP servers (or tell me if I need to restart the app).`,
    `4. Call the wallet_status tool and show me your new NQ… address and balance.`,
  ].join("\n");
}

/** The server's environment variables: name, default, what it does. */
export function mcpEnvVars(base: string): [string, string, string][] {
  return [
    ["NIMBILL_URL", base, "Base URL of the NimBill app your agent connects to."],
    [
      "NIMBILL_AGENT_SECRET_KEY",
      "Auto-generated",
      "64-char hex Ed25519 private key. If omitted, a key is generated and saved at ~/.nimbill/agent-wallet.json.",
    ],
    ["NIMBILL_WALLET_FILE", "~/.nimbill/agent-wallet.json", "Custom path for the auto-generated agent wallet JSON file."],
    [
      "NIMBILL_WALLET_PASSPHRASE",
      "None (unencrypted)",
      "Encrypts the wallet file and saved cheque secrets (scrypt + AES-256-GCM). Strongly recommended, especially on Windows.",
    ],
    ["NIMBILL_MAX_PAYMENT_NIM", "100", "Largest single payment, transfer or cheque the agent may send, in NIM."],
    ["NIMBILL_MAX_DAILY_NIM", "500", "Most NIM the agent may send in any 24 hours."],
    ["NIMIQ_RPC_URL", "https://rpc.nimiqwatch.com", "Nimiq Mainnet Albatross JSON-RPC endpoint used for balances and broadcasts."],
  ];
}
