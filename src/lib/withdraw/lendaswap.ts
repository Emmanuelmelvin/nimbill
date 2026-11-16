import "server-only";
import { Client } from "@lendasat/lendaswap-sdk-pure";
import { env } from "../env";
import { Errors } from "../errors";
import { logger } from "../logger";
import type { Chain, Token } from "./chains";
import { mnemonic, PgSwapStorage, PgWalletStorage } from "./storage";

// Lendaswap (by Satora): Lightning → USDC/USDT on Polygon, Ethereum and Arbitrum, through its
// official SDK (@lendasat/lendaswap-sdk-pure). The SDK derives each swap's secret and claim key from
// the recovery phrase (WITHDRAW_MNEMONIC), keeps them in NimBill's database (storage.ts), signs the
// gasless claim, and speaks the protocol version the API expects.
//
// How a swap moves money, and why it is safe:
//   1. NimBill creates the swap; the SDK picks a secret only NimBill knows and sends its hash.
//   2. Nimiq Pay pays the returned Lightning invoice. It is a HOLD invoice: the payment is held,
//      not taken.
//   3. Lendaswap locks WBTC in an HTLC on the target chain, for that hash.
//   4. NimBill claims gaslessly: the SDK reveals the secret and signs; Lendaswap's coordinator swaps
//      the WBTC into the stablecoin and sends it to the user's address (fixed at step 1).
//   5. Only then can Lendaswap settle the held Lightning payment (it needs the revealed secret).
// If anything stops before step 4, the held payment is cancelled and the money goes back.

export const PROVIDER_ID = "lendaswap";
export const PROVIDER_NAME = "Lendaswap";

export type LendaswapQuote = {
  exchange_rate: string; // target token per BTC
  network_fee: number;
  gasless_network_fee: number;
  protocol_fee: number;
  min_amount: number; // sats
  max_amount: number; // sats
  net_source_amount: string; // sats the payer sends, fees included
  net_target_amount: string; // target units the user receives
};

/** The fields of a Lightning → EVM swap that NimBill reads. */
export type LendaswapSwap = {
  id: string;
  status: string;
  bolt11_invoice: string;
  hash_lock: string;
  source_amount: string; // sats
  target_amount: string;
  evm_chain_id: number;
  target_evm_address?: string | null;
  evm_claim_txid?: string | null;
  invoice_expires_at?: number | null;
};

const g = globalThis as unknown as { __nimbillLendaswap?: Promise<Client> };

function client(): Promise<Client> {
  g.__nimbillLendaswap ??= Client.builder()
    .withBaseUrl(env.LENDASWAP_API_URL)
    .withMnemonic(mnemonic())
    .withSignerStorage(new PgWalletStorage())
    .withSwapStorage(new PgSwapStorage())
    .build()
    .catch((e) => {
      g.__nimbillLendaswap = undefined;
      throw e;
    });
  return g.__nimbillLendaswap;
}

/** Turn SDK errors ("Failed to create swap: {...}") into AppErrors with a readable reason. */
async function call<T>(what: string, fn: (c: Client) => Promise<T>): Promise<T> {
  try {
    return await fn(await client());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn("lendaswap failed", { what, error: message.slice(0, 500) });
    throw Errors.upstream("lendaswap", `The swap provider failed to ${what}.`, { cause: e, details: { error: message.slice(0, 300) } });
  }
}

export const lendaswap = {
  /** What the user pays over Lightning to receive exactly `receiveUnits` of `token` on `chain`. */
  quote(chain: Chain, token: Token, receiveUnits: string): Promise<LendaswapQuote> {
    return call("quote", (c) =>
      c.getQuote({
        sourceChain: "Lightning",
        sourceToken: "btc",
        targetChain: String(chain.evmChainId) as never,
        targetToken: token.contract,
        targetAmount: BigInt(receiveUnits), // smallest units, exact (a bigint)
      }),
    ) as Promise<LendaswapQuote>;
  },

  /** Create the swap. The SDK stores its secret (encrypted) before this returns. */
  async create(chain: Chain, token: Token, receiveUnits: string, destination: string): Promise<LendaswapSwap> {
    const r = await call("create the swap", (c) =>
      c.createLightningToEvmSwap({
        targetAddress: destination,
        tokenAddress: token.contract,
        evmChainId: chain.evmChainId!,
        targetAmount: BigInt(receiveUnits),
        invoiceDescription: "NimBill withdrawal",
        gasless: true,
      }),
    );
    return r.response as unknown as LendaswapSwap;
  },

  get(swapId: string): Promise<LendaswapSwap> {
    return call("read the swap", (c) => c.getSwap(swapId, { updateStorage: true })) as unknown as Promise<LendaswapSwap>;
  },

  /**
   * Claim gaslessly to the destination fixed when the swap was created. Safe to repeat (the
   * provider never relays twice). Returns the claim transaction hash, or null if not known yet.
   */
  async claim(swapId: string): Promise<string | null> {
    const r = await call("claim the swap", (c) => c.claim(swapId));
    if (!r.success) throw Errors.upstream("lendaswap", `The claim did not go through: ${r.message}`);
    return r.txHash || null;
  },
};
