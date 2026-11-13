// MCP tool schemas and execution handlers for the NimBill Agent Wallet MCP server.
import {
  assertSpendAllowed,
  broadcastRawTx,
  buildAndSignNimiqTx,
  clientNonceForTx,
  completeDualSignature,
  formatChequeCode,
  getAgentBalance,
  getCurrentBlockHeight,
  getSavedChequeSecret,
  linkKeyFromSecret,
  LUNA_PER_NIM,
  newChequeSecret,
  normalizeAddress,
  parseChequeInput,
  recordSpend,
  saveChequeSecret,
  serializeBasicTxContent,
  spendingLimits,
  spentLast24h,
} from "./wallet.mjs";

export const MCP_TOOLS = [
  {
    name: "wallet_status",
    description:
      "Check the AI agent's own Nimiq wallet address (NQ…), live on-chain NIM balance, and its signed-in NimBill profile (name, @tag, and public pay link). Call this first to see your balance or give the user your @tag / NQ address to fund.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "setup_profile",
    description:
      "Set or update the AI agent's NimBill merchant profile: display name, public @tag (e.g. 'shopbot' -> shopbot@nimbill), bio, default currency, or notification email.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name shown on invoices, cheques, and your board (e.g. 'Ada Agent')." },
        tag: { type: "string", description: "NimBill tag to claim, 3-20 lowercase letters/digits/underscores (e.g. 'ada_agent')." },
        bio: { type: "string", description: "Short bio shown on your public board." },
        defaultCurrency: { type: "string", description: "Default currency code, e.g. 'USD', 'NGN', 'EUR'." },
      },
      required: ["name"],
    },
  },
  {
    name: "lookup_tag",
    description: "Resolve a NimBill @tag (e.g. 'ada' or 'ada@nimbill') to its owner's name, Nimiq wallet address, and avatar.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "The NimBill tag to look up." },
      },
      required: ["tag"],
    },
  },
  {
    name: "get_rates",
    description: "Get live NIM and USDT prices in a local fiat currency (e.g. USD, NGN, EUR, KES, GHS, GBP).",
    inputSchema: {
      type: "object",
      properties: {
        currency: { type: "string", description: "3-letter currency code (default: 'USD')." },
      },
    },
  },
  {
    name: "get_board",
    description:
      "Read a merchant's public pay board (/pay/<tag>): who they are, their products and prices, and whether open amounts are accepted.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "The merchant's @tag (e.g. 'ada' or 'ada@nimbill')." },
      },
      required: ["tag"],
    },
  },
  {
    name: "buy_from_board",
    description:
      "Create an invoice on a merchant's public board (/pay/<tag>) for a product or open amount. Pays it on-chain from the agent's wallet only when payNow is true. Spending limits apply.",
    inputSchema: {
      type: "object",
      properties: {
        tag: { type: "string", description: "The merchant's @tag." },
        payerName: { type: "string", description: "Your name or who you are paying on behalf of (e.g. 'Agent for Tunde')." },
        productId: { type: "string", description: "Product ID from get_board when buying a listed product." },
        quantity: { type: "integer", description: "Quantity of the product (1-100, default 1)." },
        amount: { type: "number", description: "Amount when paying an open amount instead of a product." },
        currency: { type: "string", description: "Currency code for an open amount (e.g. 'USD', 'NGN')." },
        description: { type: "string", description: "What the open amount is for." },
        payNow: {
          type: "boolean",
          description:
            "Set true to immediately sign and broadcast the NIM payment from the agent's wallet. Default false: only create the invoice (pay it later with pay_invoice). Only set true when the user asked to pay.",
        },
      },
      required: ["tag", "payerName"],
    },
  },
  {
    name: "get_invoice",
    description: "Read any NimBill invoice by its ID or NMN-… number.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID (e.g. '89mwch33sp') or Nimbill number ('NMN-89MWC-H33SP')." },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "pay_invoice",
    description:
      "Pay an unpaid NimBill invoice in NIM using the agent's own Nimiq wallet: locks a 5-minute quote, signs and broadcasts the on-chain Nimiq transaction with the 'NimBill <id>' memo, and verifies it. Irreversible; spending limits apply. Confirm the amount and payee with the user first.",
    inputSchema: {
      type: "object",
      properties: {
        invoiceId: { type: "string", description: "Invoice ID or NMN-… number." },
        tip: { type: "number", description: "Optional tip in the invoice's currency." },
        dryRun: {
          type: "boolean",
          description: "If true, locks the quote and signs the transaction locally without broadcasting it to the Nimiq network.",
        },
      },
      required: ["invoiceId"],
    },
  },
  {
    name: "create_invoice",
    description: "Create a new invoice as the agent merchant so a client or another agent can pay you.",
    inputSchema: {
      type: "object",
      properties: {
        clientName: { type: "string", description: "Client's name." },
        currency: { type: "string", description: "3-letter currency code (e.g. 'USD', 'NGN', 'EUR')." },
        items: {
          type: "array",
          description: "Line items on the invoice.",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["description", "quantity", "unitPrice"],
          },
        },
        dueDate: { type: "string", description: "Optional due date (YYYY-MM-DD)." },
        note: { type: "string", description: "Optional note on the invoice." },
      },
      required: ["clientName", "currency", "items"],
    },
  },
  {
    name: "list_invoices",
    description: "List the invoices created by the agent's NimBill account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "send_to_tag",
    description:
      "Send NIM from the agent's wallet to someone's NimBill @tag (amount in NIM or any supported fiat currency). Signs and broadcasts the on-chain Nimiq transaction with the transfer memo. Irreversible; spending limits apply.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient's @tag (e.g. 'ada' or 'ada@nimbill')." },
        amount: { type: "number", description: "Amount to send." },
        currency: { type: "string", description: "'NIM' or a 3-letter fiat currency code like 'USD' or 'NGN'." },
        note: { type: "string", description: "Optional short note (up to 80 chars)." },
        dryRun: {
          type: "boolean",
          description: "If true, creates the transfer record and signs the transaction locally without broadcasting on-chain.",
        },
      },
      required: ["to", "amount", "currency"],
    },
  },
  {
    name: "write_cheque",
    description:
      "Write a non-custodial NimBill cheque (either a free cheque for anyone first to claim, or locked to a specific @tag). Generates the 2-of-2 link secret locally, creates the cheque, optionally funds it on-chain from the agent's wallet, and returns the shareable link and CHQ-… code.",
    inputSchema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "Cheque amount." },
        currency: { type: "string", description: "'NIM' or a 3-letter fiat currency code (default: 'NIM')." },
        recipientTag: {
          type: "string",
          description: "Optional @tag to lock the cheque to. Omit or pass null for a free cheque anyone can claim.",
        },
        note: { type: "string", description: "Optional memo shown on the face of the cheque." },
        fundOnChain: {
          type: "boolean",
          description:
            "If true (default), funds the cheque on-chain from the agent's wallet right away (spending limits apply). Set false to only create the cheque and return the funding details.",
        },
      },
      required: ["amount"],
    },
  },
  {
    name: "cash_cheque",
    description:
      "Cash a NimBill cheque (given its URL `/c/<id>#<secret>` or full `CHQ-…` code) on-chain! Works even when the agent wallet has 0 NIM because the cheque itself holds the funds. Sends the NIM to the agent's own wallet by default, or to any specified @tag or NQ… address.",
    inputSchema: {
      type: "object",
      properties: {
        cheque: { type: "string", description: "Full cheque URL (with #secret) or full CHQ-XXXXX-XXXXX-XXXXXX-… code." },
        toTagOrAddress: {
          type: "string",
          description:
            "Optional @tag or Nimiq NQ… address to receive the funds. Defaults to the agent's own wallet (or the locked tag's wallet).",
        },
        claimerName: { type: "string", description: "Optional name shown to the cheque writer." },
      },
      required: ["cheque"],
    },
  },
  {
    name: "cancel_cheque",
    description: "Cancel an uncashed cheque written by the agent and sweep the NIM back into the agent's wallet.",
    inputSchema: {
      type: "object",
      properties: {
        cheque: {
          type: "string",
          description: "Cheque URL, CHQ-… code, or just the cheque number for a cheque this agent wrote (its secret is saved locally).",
        },
      },
      required: ["cheque"],
    },
  },
  {
    name: "list_cheques",
    description: "List the cheques written by the agent's NimBill account.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// What each tool may do, for MCP clients that ask the user before risky calls.
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const SPEND = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
const ANNOTATIONS = {
  wallet_status: READ,
  setup_profile: { ...WRITE, idempotentHint: true },
  lookup_tag: READ,
  get_rates: READ,
  get_board: READ,
  buy_from_board: SPEND,
  get_invoice: READ,
  pay_invoice: SPEND,
  create_invoice: WRITE,
  list_invoices: READ,
  send_to_tag: SPEND,
  write_cheque: SPEND,
  cash_cheque: WRITE,
  cancel_cheque: WRITE,
  list_cheques: READ,
};
for (const t of MCP_TOOLS) t.annotations = ANNOTATIONS[t.name];

// ---------- argument validation ----------

const TYPE_CHECKS = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === "object" && !Array.isArray(v),
};

/** Check `args` against a tool's inputSchema (required fields, types, unknown fields). Throws on the first problem. */
export function validateToolArgs(tool, args) {
  if (!TYPE_CHECKS.object(args)) throw toolError("INVALID_ARGUMENTS", "Tool arguments must be an object.");
  const { properties = {}, required = [] } = tool.inputSchema;
  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw toolError("INVALID_ARGUMENTS", `Missing required argument "${key}".`);
    }
  }
  for (const [key, value] of Object.entries(args)) {
    const prop = properties[key];
    if (!prop) throw toolError("INVALID_ARGUMENTS", `Unknown argument "${key}".`);
    if (value === undefined || value === null) continue;
    if (!TYPE_CHECKS[prop.type]?.(value)) throw toolError("INVALID_ARGUMENTS", `Argument "${key}" must be a ${prop.type}.`);
    if (prop.type === "array" && prop.items?.type === "object") {
      for (const item of value) validateToolArgs({ inputSchema: prop.items }, item);
    }
  }
}

function toolError(code, message) {
  return Object.assign(new Error(message), { code });
}

// ---------- helpers ----------

function cleanId(raw) {
  const s = String(raw).trim();
  const m = s.match(/\/i\/([2-9a-hjkmnp-z]{10})/i);
  if (m) return m[1].toLowerCase();
  const nmn = s.replace(/^nmn[\s\-–—]*/i, "").replace(/[\s\-–—]/g, "");
  if (/^[2-9a-hjkmnp-z]{10}$/i.test(nmn)) return nmn.toLowerCase();
  throw toolError("INVALID_ARGUMENTS", `"${s}" is not an invoice ID, link or NMN-… number.`);
}

function cleanTag(raw) {
  const tag = String(raw)
    .trim()
    .replace(/^@/, "")
    .replace(/@nimbill$/i, "")
    .toLowerCase();
  if (!/^[a-z0-9_]{1,30}$/.test(tag)) throw toolError("INVALID_ARGUMENTS", `"${raw}" is not a NimBill tag.`);
  return tag;
}

const nim = (luna) => Number(luna) / LUNA_PER_NIM;
const explorerUrl = (hash) => `https://nimiq.watch/#${hash}`;

/**
 * Sign, check limits and balance, broadcast, and record a payment from the agent wallet.
 * Returns the tx hash once the network accepted it.
 */
async function sendFromAgent(client, { recipient, luna, memo, what }) {
  const { wallet, dataDir } = client;
  if (!normalizeAddress(recipient)) throw new Error(`The server returned an invalid recipient address for ${what}.`);
  if (!/^[1-9][0-9]*$/.test(String(luna))) throw new Error(`The server returned an invalid amount for ${what}.`);
  assertSpendAllowed(dataDir, luna, what);
  const balance = await getAgentBalance(wallet.address);
  if (balance.luna < Number(luna)) {
    throw toolError(
      "INSUFFICIENT_FUNDS",
      `Insufficient NIM in the agent wallet (${wallet.address}): have ${balance.nim} NIM, need ${nim(luna)} NIM.`,
    );
  }
  const signed = buildAndSignNimiqTx({
    secretKey: wallet.secretKey,
    recipient,
    valueLuna: luna,
    validityStartHeight: await getCurrentBlockHeight(),
    memo,
  });
  await broadcastRawTx(signed.rawTx);
  recordSpend(dataDir, luna, { what, to: recipient, txHash: signed.txHash });
  return signed;
}

/** Ask the server to verify a broadcast payment, without losing the tx hash if that call fails. */
async function verifyAfterBroadcast(client, path, body) {
  try {
    return await client.request(path, { method: "POST", auth: true, body });
  } catch (e) {
    return { status: "unverified", message: `Broadcast succeeded, but verification failed: ${e.message}. Call again later.` };
  }
}

// ---------- execution ----------

export async function executeTool(name, args = {}, client) {
  const { wallet, baseUrl, dataDir } = client;
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw toolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
  validateToolArgs(tool, args);

  switch (name) {
    case "wallet_status": {
      const [meRes, balance] = await Promise.all([
        client.request("/api/auth/me", { auth: true }).catch(() => ({ merchant: null })),
        getAgentBalance(wallet.address).catch((e) => ({ error: e.message })),
      ]);
      const merchant = meRes?.merchant ?? null;
      const limits = spendingLimits();
      return {
        address: wallet.address,
        publicKey: wallet.publicKeyHex,
        walletSource: wallet.source,
        balance:
          "error" in balance
            ? { error: `Balance unavailable: ${balance.error}` }
            : { nim: balance.nim, luna: String(balance.luna), formatted: `${balance.nim} NIM` },
        spending: { ...limits, spentLast24hNim: spentLast24h(dataDir) },
        profile: merchant
          ? {
              name: merchant.name || null,
              tag: merchant.tag || null,
              handle: merchant.tag ? `${merchant.tag}@nimbill` : null,
              boardUrl: merchant.tag ? `${baseUrl}/pay/${merchant.tag}` : null,
              displayCurrency: merchant.displayCurrency ?? null,
            }
          : null,
      };
    }

    case "setup_profile": {
      const body = {
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.tag !== undefined ? { tag: args.tag } : {}),
        ...(args.bio !== undefined ? { bio: args.bio } : {}),
        ...(args.defaultCurrency !== undefined ? { displayCurrency: args.defaultCurrency } : {}),
      };
      const updated = await client.request("/api/me", { method: "POST", body, auth: true });
      return {
        merchant: updated.merchant,
        handle: updated.merchant.tag ? `${updated.merchant.tag}@nimbill` : null,
        boardUrl: updated.merchant.tag ? `${baseUrl}/pay/${updated.merchant.tag}` : null,
      };
    }

    case "lookup_tag":
      return await client.request(`/api/tags/${encodeURIComponent(cleanTag(args.tag))}`);

    case "get_rates": {
      const currency = (args.currency || "USD").toUpperCase();
      if (!/^[A-Z]{3,4}$/.test(currency)) throw toolError("INVALID_ARGUMENTS", "currency must be a 3-letter code.");
      return await client.request(`/api/rates?currency=${encodeURIComponent(currency)}`);
    }

    case "get_board":
      return await client.request(`/api/pay/${encodeURIComponent(cleanTag(args.tag))}`);

    case "get_invoice": {
      const id = cleanId(args.invoiceId);
      const res = await client.request(`/api/invoices/${encodeURIComponent(id)}`);
      return { ...res, url: `${baseUrl}/i/${res.invoice.id}` };
    }

    case "create_invoice": {
      const res = await client.request("/api/invoices", {
        method: "POST",
        auth: true,
        body: {
          clientName: args.clientName,
          currency: args.currency,
          items: args.items,
          dueDate: args.dueDate,
          note: args.note,
        },
      });
      return { invoice: res.invoice, url: `${baseUrl}/i/${res.invoice.id}` };
    }

    case "list_invoices":
      return await client.request("/api/invoices", { auth: true });

    case "pay_invoice": {
      const id = cleanId(args.invoiceId);
      const { quote } = await client.request(`/api/invoices/${encodeURIComponent(id)}/quote`, {
        method: "POST",
        body: { asset: "NIM", tip: args.tip ?? 0 },
      });
      if (quote.memo !== `NimBill ${id}`) throw new Error("The quote's payment memo doesn't match this invoice.");

      if (args.dryRun) {
        const signed = buildAndSignNimiqTx({
          secretKey: wallet.secretKey,
          recipient: quote.recipient,
          valueLuna: quote.amount,
          validityStartHeight: await getCurrentBlockHeight(),
          memo: quote.memo,
        });
        return { status: "dry_run", quote, txHash: signed.txHash, rawTx: signed.rawTx, amountNim: nim(quote.amount) };
      }

      const signed = await sendFromAgent(client, {
        recipient: quote.recipient,
        luna: quote.amount,
        memo: quote.memo,
        what: `Invoice ${id}`,
      });
      const verify = await verifyAfterBroadcast(client, `/api/invoices/${encodeURIComponent(id)}/verify`, {
        asset: "NIM",
        txHash: signed.txHash,
      });
      return {
        txHash: signed.txHash,
        explorerUrl: explorerUrl(signed.txHash),
        amountNim: nim(quote.amount),
        recipient: quote.recipient,
        verificationStatus: verify.status,
        ...(verify.message ? { verificationMessage: verify.message } : {}),
        invoiceUrl: `${baseUrl}/i/${id}`,
        receiptUrl: `${baseUrl}/i/${id}/receipt`,
      };
    }

    case "buy_from_board": {
      const created = await client.request(`/api/pay/${encodeURIComponent(cleanTag(args.tag))}/invoices`, {
        method: "POST",
        body: {
          payerName: args.payerName,
          productId: args.productId,
          quantity: args.quantity,
          amount: args.amount,
          currency: args.currency,
          description: args.description,
        },
      });
      const inv = created.invoice;
      if (args.payNow !== true) {
        return {
          invoice: inv,
          invoiceUrl: `${baseUrl}/i/${inv.id}`,
          next: "Not paid yet. Call pay_invoice with this invoice ID once the user confirms.",
        };
      }
      const paid = await executeTool("pay_invoice", { invoiceId: inv.id }, client);
      return { invoice: inv, payment: paid };
    }

    case "send_to_tag": {
      const created = await client.request("/api/transfers", {
        method: "POST",
        auth: true,
        // The agent wallet only signs Nimiq transactions, so its transfers are always NIM.
        body: { to: args.to, asset: "NIM", amount: args.amount, currency: args.currency, note: args.note },
      });
      const t = created.transfer;
      // What to send (recipient, Luna, memo) is in `payment`, not on the transfer itself.
      const pay = created.payment;

      if (args.dryRun) {
        const signed = buildAndSignNimiqTx({
          secretKey: wallet.secretKey,
          recipient: pay.recipient,
          valueLuna: pay.amount,
          validityStartHeight: await getCurrentBlockHeight(),
          memo: pay.memo,
        });
        return { status: "dry_run", transfer: t, txHash: signed.txHash, rawTx: signed.rawTx, amountNim: nim(pay.amount) };
      }

      const signed = await sendFromAgent(client, {
        recipient: pay.recipient,
        luna: pay.amount,
        memo: pay.memo,
        what: `Transfer to ${args.to}`,
      });
      const verify = await verifyAfterBroadcast(client, `/api/transfers/${encodeURIComponent(t.id)}/verify`, {
        txHash: signed.txHash,
      });
      return {
        transfer: verify.transfer || t,
        txHash: signed.txHash,
        explorerUrl: explorerUrl(signed.txHash),
        verificationStatus: verify.status,
        ...(verify.message ? { verificationMessage: verify.message } : {}),
      };
    }

    case "write_cheque": {
      const secret = newChequeSecret();
      const { publicKey: linkPublicKey } = linkKeyFromSecret(secret);
      const created = await client.request("/api/cheques", {
        method: "POST",
        auth: true,
        body: {
          amount: args.amount,
          currency: args.currency || "NIM",
          linkPublicKey,
          recipientTag: args.recipientTag ? cleanTag(args.recipientTag) : null,
          note: args.note,
        },
      });
      const { cheque, payment } = created;
      const url = `${baseUrl}/c/${cheque.id}#${secret}`;
      const code = formatChequeCode(cheque.id, secret);

      // Save the secret before any money moves: without it the cheque can't be cancelled.
      saveChequeSecret(dataDir, cheque.id, secret, { number: cheque.number, amount: cheque.amount });

      if (payment?.recipient !== cheque.chequeAddress || payment?.amount !== cheque.amount || payment?.memo !== `NimBill C ${cheque.id}`) {
        throw new Error("The server's funding details don't match the cheque. Nothing was sent.");
      }

      let funding = { fundedOnChain: false, txHash: null };
      if (args.fundOnChain !== false) {
        const signed = await sendFromAgent(client, {
          recipient: payment.recipient,
          luna: payment.amount,
          memo: payment.memo,
          what: `Cheque ${cheque.number}`,
        });
        const verify = await verifyAfterBroadcast(client, `/api/cheques/${encodeURIComponent(cheque.id)}/verify`, {
          txHash: signed.txHash,
        });
        funding = {
          fundedOnChain: true,
          txHash: signed.txHash,
          explorerUrl: explorerUrl(signed.txHash),
          status: verify.status,
          ...(verify.message ? { message: verify.message } : {}),
        };
      } else {
        funding.instructions = `Send ${nim(payment.amount)} NIM to ${payment.recipient} with the memo '${payment.memo}' to fund it.`;
      }

      return {
        cheque,
        claimUrl: url,
        chequeCode: code,
        secret,
        secretSavedTo: dataDir,
        funding,
      };
    }

    case "cash_cheque":
    case "cancel_cheque": {
      const action = name === "cancel_cheque" ? "cancel" : "cash";
      const parsed = parseChequeInput(args.cheque);
      if (!parsed) throw toolError("INVALID_ARGUMENTS", "That isn't a cheque URL, CHQ-… code or cheque number.");
      const secret = parsed.secret ?? getSavedChequeSecret(dataDir, parsed.id);
      if (!secret) {
        throw toolError(
          "INVALID_ARGUMENTS",
          "Provide the full cheque URL (including #<secret>) or the full CHQ-XXXXX-XXXXX-XXXXXX-… code.",
        );
      }

      const info = await client.request(`/api/cheques/${encodeURIComponent(parsed.id)}`, { auth: action === "cancel" });
      const cheque = info.cheque;
      if (cheque.status !== "funded")
        throw new Error(`This cheque can't be ${action === "cash" ? "cashed" : "cancelled"}: it is ${cheque.status}.`);
      if (!/^[1-9][0-9]*$/.test(info.balance ?? "")) throw new Error("The cheque's balance is unavailable. Try again shortly.");
      linkKeyFromSecret(secret); // throws on a malformed secret

      let recipientAddress = wallet.address;
      if (action === "cash") {
        if (cheque.recipient.kind === "tag") {
          recipientAddress = cheque.recipient.address;
        } else if (args.toTagOrAddress) {
          const raw = String(args.toTagOrAddress).trim();
          if (/^NQ\d{2}/i.test(raw.replace(/\s+/g, ""))) {
            recipientAddress = raw;
          } else {
            const tagRes = await executeTool("lookup_tag", { tag: raw }, client);
            recipientAddress = tagRes.owner.address;
          }
        }
      }
      const recipient = normalizeAddress(recipientAddress || "");
      if (!recipient) throw toolError("INVALID_ARGUMENTS", `Invalid Nimiq address: ${recipientAddress}`);

      const tx = {
        senderPublicKey: cheque.chequePublicKey,
        recipient,
        value: info.balance,
        fee: 0,
        validityStartHeight: info.currentBlock || (await getCurrentBlockHeight()),
      };
      const common = {
        action,
        recipientAddress: recipient,
        claimerName: args.claimerName,
        validityStartHeight: tx.validityStartHeight,
        value: info.balance,
      };
      const { nonceScalar, noncePublicKey } = clientNonceForTx(secret, serializeBasicTxContent(tx));

      const prep = await client.request(`/api/cheques/${encodeURIComponent(cheque.id)}/claim`, {
        method: "POST",
        auth: action === "cancel",
        body: { step: "prepare", ...common, clientNoncePublicKey: noncePublicKey },
      });

      // Signs only the transaction built above, whatever the server sent back.
      const { rawTx, txHash } = completeDualSignature({
        secret,
        tx,
        nonceScalar,
        serverNoncePublicKey: prep.serverNoncePublicKey,
        serverPartialSig: prep.serverPartialSig,
      });

      const done = await client.request(`/api/cheques/${encodeURIComponent(cheque.id)}/claim`, {
        method: "POST",
        auth: action === "cancel",
        body: { step: "broadcast", ...common, rawTx },
      });

      return {
        cheque: done.cheque,
        status: done.cheque?.status,
        txHash: done.txHash || txHash,
        explorerUrl: explorerUrl(done.txHash || txHash),
        amountNim: nim(info.balance),
        recipientAddress: recipient,
      };
    }

    case "list_cheques":
      return await client.request("/api/cheques", { auth: true });

    default:
      throw toolError("UNKNOWN_TOOL", `Unknown tool: ${name}`);
  }
}
