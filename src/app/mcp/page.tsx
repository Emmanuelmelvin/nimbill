import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AI_LOGOS, AiLogo } from "@/components/AiLogos";
import { Code, Fields, Section, Tile } from "@/components/docs/DocsParts";
import { Badge, CoinText, Eyebrow, Header, LinkButton, TextLink, buttonStyles, cx } from "@/components/ui";
import type { Field } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";
// The published package's own manifest, so the name and version shown here never drift from npm.
import mcpPackage from "../../../mcp/package.json";

const PKG = mcpPackage.name;
const NPM_URL = `https://www.npmjs.com/package/${PKG}`;
const NODE_MIN = mcpPackage.engines.node.replace(/^>=\s*/, "");

const TOC = [
  ["what-it-does", "What it does"],
  ["connect", "How to connect"],
  ["funding", "Funding your agent"],
  ["prompts", "Example prompts"],
  ["tools", "All 15 MCP tools"],
  ["architecture", "How it works under the hood"],
  ["security", "Security & custody"],
] as const;

const json = (v: unknown) => JSON.stringify(v, null, 2);
const logo = (key: string) => AI_LOGOS.find((l) => l.key === key)!;

type ToolDoc = {
  name: string;
  category: "Wallet & Identity" | "Paying & Sending" | "Cheques" | "Invoicing";
  summary: string;
  description: string;
  fields?: Field[];
  exampleCall: Record<string, unknown>;
  exampleResult: unknown;
};

const TOOLS: ToolDoc[] = [
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

const PROMPTS = [
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

export default async function McpPage() {
  const base = requestOrigin(await headers());
  const stdConfig = {
    mcpServers: {
      nimbill: {
        command: "npx",
        args: ["-y", PKG],
        env: {
          NIMBILL_URL: base,
        },
      },
    },
  };
  // Paste into any agent that can run commands and edit its own MCP config.
  const agentSetupPrompt = [
    `Set up the NimBill Agent Wallet MCP server for yourself. It is published on npm as "${PKG}" (${NPM_URL}) and needs Node.js ${NODE_MIN} or newer.`,
    ``,
    `1. Check that \`node --version\` is ${NODE_MIN} or newer.`,
    `2. Register an MCP server named "nimbill" in this client's MCP config that runs \`npx -y ${PKG}\` with these environment variables:`,
    `   - NIMBILL_URL=${base}`,
    `   - NIMBILL_WALLET_PASSPHRASE=<ask me for a passphrase; never invent one>`,
    `3. Reload the MCP servers (or tell me if I need to restart the app).`,
    `4. Call the wallet_status tool and show me your new NQ… address and balance.`,
  ].join("\n");

  return (
    <div className="bleed">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <Header back="/" />

        {/* ── Hero ───────────────────────────────────────────── */}
        <div className="pb-10">
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>Model Context Protocol (MCP)</Eyebrow>
            <Badge variant="solid">15 Tools</Badge>
            <Badge variant="outline">Non-Custodial Agent Wallet</Badge>
          </div>
          <h1 className="mt-3 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tighter sm:text-6xl">
            Give your AI agent its own Nimiq wallet.
          </h1>
          <p className="mt-4 max-w-2xl text-muted sm:text-lg">
            NimBill ships an MCP server on npm (<span className="font-mono text-ink">npx -y {PKG}</span>) that gives Claude, Cursor,
            Windsurf, and Antigravity their own non-custodial Ed25519 Nimiq wallet, a <span className="font-mono text-ink">@tag</span>, and
            <CoinText>15 tools to pay invoices, buy from boards, send NIM by tag, and write or cash cheques on-chain.</CoinText>
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#connect" className={buttonStyles({ size: "md" })}>
              Connect your AI
            </a>
            <a href="#tools" className={buttonStyles({ variant: "secondary", size: "md" })}>
              Explore all 15 tools
            </a>
            <a href={NPM_URL} target="_blank" rel="noopener noreferrer" className={buttonStyles({ variant: "secondary", size: "md" })}>
              View on npm ↗
            </a>
            <LinkButton href="/docs" variant="secondary" size="md">
              HTTP API docs
            </LinkButton>
          </div>

          {/* The npm package at a glance: one command runs it, nothing to clone. */}
          <div className="mt-6 grid max-w-2xl gap-0 border border-ink sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className="flex items-center gap-3 border-b border-ink bg-ink px-4 py-3 text-paper sm:border-r sm:border-b-0">
              <span className="font-mono text-[11px] font-semibold tracking-wider uppercase">npm</span>
              <span className="font-mono text-sm font-semibold">{PKG}</span>
              <span className="border border-paper/40 px-1.5 py-px font-mono text-[10px]">v{mcpPackage.version}</span>
            </div>
            <Code copy className="border-0" label={`Node ${NODE_MIN}+ · no install needed`}>{`npx -y ${PKG}`}</Code>
          </div>

          <div className="mt-10 border border-ink">
            <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">
              Compatible MCP hosts &amp; AI assistants
            </p>
            <ul className="grid grid-cols-3 sm:grid-cols-6">
              {AI_LOGOS.map((l, i) => (
                <li
                  key={l.key}
                  className={cx(
                    "group flex flex-col items-center gap-2 px-2 py-5 transition-colors hover:bg-ink hover:text-paper",
                    i % 3 !== 0 && "border-l border-line",
                    i >= 3 && "border-t border-line sm:border-t-0",
                    i === 3 && "sm:border-l",
                  )}
                >
                  <AiLogo logo={l} size={30} />
                  <span className="text-xs font-semibold">{l.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 pb-20 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* ── Table of Contents ────────────────────────────── */}
          <nav aria-label="On this page" className="lg:sticky lg:top-6 lg:self-start">
            <Eyebrow className="mb-2">On this page</Eyebrow>
            <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-0">
              {TOC.map(([id, label], i) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex items-baseline gap-2 border border-line px-2 py-1 text-sm text-muted transition-colors hover:text-ink lg:border-0 lg:border-l lg:px-3 lg:py-1.5 lg:hover:border-ink"
                  >
                    <span className="font-mono text-[10px]">{String(i + 1).padStart(2, "0")}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 space-y-14">
            {/* ── 01 What it does ────────────────────────────── */}
            <Section
              id="what-it-does"
              index="01"
              label="What it does"
              title="An AI agent that can earn, spend, and hold NIM."
              intro="Most payment APIs stop at creating a link for a human to click. NimBill's MCP server gives your agent its own Nimiq keypair on your machine so it can complete the entire loop on-chain."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile icon="01" title="Own Non-Custodial Nimiq Wallet">
                  On first launch, the MCP server generates an Ed25519 keypair at{" "}
                  <span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span>, derives its{" "}
                  <span className="font-mono text-ink">NQ…</span> address, and signs NimBill&apos;s challenge message to log into its own
                  account. Your agent&apos;s private key never leaves your computer.
                </Tile>
                <Tile icon="02" title="Pay Invoices & Boards On-Chain">
                  The agent can read any <span className="font-mono text-ink">/pay/&lt;tag&gt;</span> board or{" "}
                  <span className="font-mono text-ink">NMN-…</span> invoice, lock a 5-minute NIM quote, sign the Nimiq Albatross transaction
                  with the <span className="font-mono text-ink">NimBill &lt;id&gt;</span> memo, broadcast it, and verify the receipt.
                </Tile>
                <Tile icon="03" title="Write & Cash Cheques">
                  Hand your agent a <span className="font-mono text-ink">CHQ-…</span> code in chat and it can cash the NIM straight into its
                  wallet (or route it to any <span className="font-mono text-ink">@tag</span>) — or ask your agent to write a funded cheque
                  and hand you the link.
                </Tile>
                <Tile icon="04" title="Claim a @tag & Bill Clients">
                  Your agent can claim its own handle like <span className="font-mono text-ink">studiobot@nimbill</span>, issue invoices in
                  19 currencies, and check when clients have paid on the blockchain.
                </Tile>
              </div>
            </Section>

            {/* ── 02 How to connect ──────────────────────────── */}
            <Section
              id="connect"
              index="02"
              label="How to connect"
              title="Set it up in 60 seconds."
              intro={`The MCP server is the "${PKG}" package on npm. It runs locally over stdio with Node.js ${NODE_MIN}+, and npx fetches it on first launch, so there is nothing to clone or build.`}
            >
              <div className="space-y-6">
                <article className="border border-ink">
                  <header className="border-b border-ink bg-ink p-4 text-paper">
                    <h3 className="font-bold">Fastest: let your agent install it</h3>
                  </header>
                  <div className="space-y-3 p-4 text-sm text-muted">
                    <p>
                      Paste this into Claude Code, Cursor, Windsurf or Antigravity. The agent installs{" "}
                      <TextLink href={NPM_URL} external>
                        {PKG}
                      </TextLink>{" "}
                      from npm, wires it into its own config, and shows you its new wallet address. It will ask you for a passphrase to
                      encrypt the wallet.
                    </p>
                    <Code label="prompt for your agent">{agentSetupPrompt}</Code>
                    <p>Prefer to do it by hand? Pick your client below.</p>
                  </div>
                </article>

                <HostCard logos={["claude"]} title="Claude Desktop">
                  <p>
                    Add this to your <span className="font-mono text-ink">claude_desktop_config.json</span> (macOS:{" "}
                    <span className="font-mono break-all text-ink">~/Library/Application Support/Claude/claude_desktop_config.json</span>,
                    Windows: <span className="font-mono break-all text-ink">%APPDATA%\Claude\claude_desktop_config.json</span>) and restart
                    Claude Desktop:
                  </p>
                  <Code label="claude_desktop_config.json">{json(stdConfig)}</Code>
                </HostCard>

                <HostCard logos={["claude"]} title="Claude Code (CLI)">
                  <p>Run this command in your terminal to register the NimBill Agent Wallet MCP server in Claude Code:</p>
                  <Code label="terminal">{`claude mcp add nimbill -e NIMBILL_URL=${base} -- npx -y ${PKG}`}</Code>
                </HostCard>

                <HostCard logos={["cursor"]} title="Cursor">
                  <p>
                    Save this in your project&apos;s <span className="font-mono text-ink">.cursor/mcp.json</span> (or globally in{" "}
                    <span className="font-mono text-ink">~/.cursor/mcp.json</span>), then enable the{" "}
                    <span className="font-mono text-ink">nimbill</span> server under Cursor Settings → MCP:
                  </p>
                  <Code label=".cursor/mcp.json">{json(stdConfig)}</Code>
                </HostCard>

                <HostCard logos={["gemini"]} title="Google Antigravity / Windsurf / Other MCP Clients">
                  <p>
                    Add the <span className="font-mono text-ink">nimbill</span> entry to your client&apos;s{" "}
                    <span className="font-mono text-ink">mcp_config.json</span>:
                  </p>
                  <Code label="mcp_config.json">{json(stdConfig)}</Code>
                </HostCard>

                <div className="border border-ink">
                  <p className="border-b border-ink bg-subtle px-4 py-2 font-mono text-[11px] tracking-wider text-muted uppercase">
                    Environment variables (all optional)
                  </p>
                  <dl className="divide-y divide-line text-sm">
                    {[
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
                      [
                        "NIMIQ_RPC_URL",
                        "https://rpc.nimiqwatch.com",
                        "Nimiq Mainnet Albatross JSON-RPC endpoint used for balances and broadcasts.",
                      ],
                    ].map(([name, def, desc]) => (
                      <div key={name} className="grid gap-1 p-4 sm:grid-cols-[15rem_1fr] sm:gap-4">
                        <dt className="font-mono text-xs">
                          <span className="font-semibold text-ink">{name}</span>
                          <span className="mt-0.5 block text-[11px] text-muted">Default: {def}</span>
                        </dt>
                        <dd className="text-muted">{desc}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </Section>

            {/* ── 03 Funding your agent ──────────────────────── */}
            <Section
              id="funding"
              index="03"
              label="Funding your agent"
              title="Three ways to give your agent spending money."
              intro="Your agent starts with a fresh wallet (0 NIM) so it can only ever spend what you intentionally put into it."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Tile icon="1" title="Hand it a NimBill Cheque">
                  Write a cheque on <TextLink href="/cheques">/cheques</TextLink> and paste the{" "}
                  <span className="font-mono text-ink">CHQ-…</span> code into chat:{" "}
                  <span className="text-ink italic">&ldquo;Cash this cheque into your wallet.&rdquo;</span> Because the cheque itself holds
                  the funds, your agent can claim it even when its balance is 0 NIM.
                </Tile>
                <Tile icon="2" title="Send to its @tag">
                  Ask your agent to run <span className="font-mono text-ink">setup_profile</span> to claim a tag like{" "}
                  <span className="font-mono text-ink">mybot@nimbill</span>, then send NIM to that tag from{" "}
                  <TextLink href="/send">/send</TextLink> in Nimiq Pay.
                </Tile>
                <Tile icon="3" title="Send to its NQ… address">
                  Ask your agent <span className="text-ink italic">&ldquo;What is your Nimiq wallet address?&rdquo;</span> (calls{" "}
                  <span className="font-mono text-ink">wallet_status</span>) and send NIM from any Nimiq wallet.
                </Tile>
              </div>
            </Section>

            {/* ── 04 Example prompts ─────────────────────────── */}
            <Section
              id="prompts"
              index="04"
              label="Example prompts"
              title="What you can ask your AI once connected."
              intro="Try any of these prompts in Claude, Cursor, or Antigravity after adding the MCP server."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {PROMPTS.map((p) => (
                  <div key={p.title} className="flex flex-col justify-between border border-ink p-4">
                    <div>
                      <p className="font-mono text-[11px] font-semibold tracking-wider text-muted uppercase">{p.title}</p>
                      <p className="mt-2 text-sm font-medium text-ink">&ldquo;{p.prompt}&rdquo;</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* ── 05 All 15 MCP tools ────────────────────────── */}
            <Section
              id="tools"
              index="05"
              label="All 15 MCP tools"
              title="Complete tool & resource reference."
              intro="Every tool exposed by mcp/index.mjs over tools/list and tools/call, plus the nimbill://wallet resource."
            >
              <div className="space-y-6">
                <div className="border border-ink p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm font-bold">nimbill://wallet</span>
                    <Badge variant="outline">MCP Resource</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Read-only JSON resource exposing the agent&apos;s <span className="font-mono text-ink">NQ…</span> address, public key,
                    live on-chain NIM balance, and signed-in NimBill profile so MCP hosts can attach wallet context automatically.
                  </p>
                </div>

                {TOOLS.map((t) => (
                  <article key={t.name} id={`tool-${t.name}`} className="scroll-mt-20 border border-ink">
                    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ink bg-subtle p-4">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-ink px-2 py-0.5 font-mono text-xs font-bold text-paper">{t.name}</span>
                        <span className="text-sm font-semibold">{t.summary}</span>
                      </div>
                      <Badge variant="outline">{t.category}</Badge>
                    </header>
                    <div className="space-y-4 p-4">
                      <p className="text-sm text-muted">{t.description}</p>
                      {t.fields && <Fields title="Arguments" fields={t.fields} />}
                      <div className="grid gap-3 lg:grid-cols-2">
                        <Code label="Tool arguments" copy={false}>
                          {json(t.exampleCall)}
                        </Code>
                        <Code label="Tool response" copy={false}>
                          {json(t.exampleResult)}
                        </Code>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </Section>

            {/* ── 06 Architecture ────────────────────────────── */}
            <Section
              id="architecture"
              index="06"
              label="How it works under the hood"
              title="Real Nimiq Albatross cryptography, zero custody."
              intro="The MCP server speaks Nimiq Mainnet Albatross (network ID 24) and NimBill's session protocol directly."
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Tile title="Passwordless Wallet Sign-In">
                  When a tool requires authentication, <span className="font-mono text-ink">mcp/client.mjs</span> fetches{" "}
                  <span className="font-mono text-ink">/api/auth/challenge</span>, signs{" "}
                  <span className="font-mono text-ink">\x16Nimiq Signed Message:\n…</span> with the agent&apos;s Ed25519 key, and exchanges
                  it at <span className="font-mono text-ink">/api/auth/verify</span> for an httpOnly session cookie.
                </Tile>
                <Tile title="Basic & Extended Transactions">
                  <span className="font-mono text-ink">mcp/wallet.mjs</span> serializes both 139-byte{" "}
                  <span className="font-mono text-ink">TransactionFormat::Basic</span> transfers and{" "}
                  <span className="font-mono text-ink">TransactionFormat::Extended</span> transfers carrying{" "}
                  <span className="font-mono text-ink">recipient_data</span> memos (<span className="font-mono text-ink">NimBill …</span>),
                  then broadcasts via <span className="font-mono text-ink">sendRawTransaction</span>.
                </Tile>
                <Tile title="2-of-2 Threshold Cheques">
                  Each cheque address combines a link public key (<span className="font-mono text-ink">A_link</span>) with NimBill&apos;s
                  rule-enforcing key (<span className="font-mono text-ink">A_server</span>). When cashing or cancelling, the agent combines
                  both partial Ed25519 signatures into a standard 64-byte signature on-chain.
                </Tile>
              </div>
            </Section>

            {/* ── 07 Security ────────────────────────────────── */}
            <Section id="security" index="07" label="Security & custody" title="Built so your main wallet stays untouched.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Tile title="Dedicated Agent Wallet">
                  <ul className="mt-2 list-disc space-y-1.5 pl-4">
                    <li>Never put your personal recovery phrase into an AI tool.</li>
                    <li>
                      The MCP server creates a separate, dedicated wallet at{" "}
                      <span className="font-mono text-ink">~/.nimbill/agent-wallet.json</span> with <span className="font-mono">0600</span>{" "}
                      file permissions.
                    </li>
                    <li>Fund it only with the amount you want your agent to spend — or top it up per task using a NimBill cheque.</li>
                  </ul>
                </Tile>
                <Tile title="Test It Locally">
                  <p>
                    Run the automated MCP test suite in the repository to verify wallet generation, Albatross transaction signing, and all
                    15 tools:
                  </p>
                  <div className="mt-3">
                    <Code label="terminal">npm run test:mcp</Code>
                  </div>
                </Tile>
              </div>

              <div className="mt-10 flex flex-col items-start gap-3 border border-ink bg-ink p-6 text-paper sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-bold">Ready to fund your agent?</p>
                  <p className="text-sm text-paper/70">Write a cheque in Nimiq Pay and paste the code into your AI chat.</p>
                </div>
                <LinkButton href="/cheques" variant="secondary" className="border-paper">
                  Write a cheque
                </LinkButton>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function HostCard({ logos, title, children }: { logos: string[]; title: string; children: ReactNode }) {
  return (
    <article className="border border-ink">
      <header className="flex items-center gap-3 border-b border-ink p-4">
        <span className="flex items-center gap-2">
          {logos.map((k) => (
            <span key={k} className="flex h-10 w-10 items-center justify-center border border-ink">
              <AiLogo logo={logo(k)} size={22} />
            </span>
          ))}
        </span>
        <h3 className="font-bold">{title}</h3>
      </header>
      <div className="space-y-3 p-4 text-sm text-muted">{children}</div>
    </article>
  );
}
