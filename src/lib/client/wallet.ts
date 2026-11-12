"use client";
// Client for the Polygon wallet that Nimiq Pay injects as `window.ethereum` (EIP-1193).
// Used for USDT payments and to read the merchant's Polygon address.
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { Errors } from "@/lib/errors";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

const POLYGON_CHAIN_ID = "0x89";
export const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

/** Some hosts hand back the whole JSON-RPC response instead of just its result. */
function unwrap(v: unknown): unknown {
  return v && typeof v === "object" && "result" in v ? (v as { result: unknown }).result : v;
}

/**
 * Read a JSON-RPC number without throwing. Wallets answer with a hex string, a decimal string or a
 * plain number, and with "0x" when there is nothing to read (a contract call on the wrong network,
 * for one). `BigInt("0x")` throws "Cannot convert 0x to a BigInt", so anything unreadable is null.
 */
function toBigInt(raw: unknown): bigint | null {
  const v = unwrap(raw);
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? BigInt(v) : null;
  if (typeof v === "string" && /^(0x[0-9a-f]+|\d+)$/i.test(v)) return BigInt(v);
  return null;
}

function provider(): Eip1193 {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  if (!eth) throw Errors.wallet("USDT payments need Nimiq Pay. Open this invoice in Nimiq Pay.");
  return eth;
}

export const polygonWallet = {
  available(): boolean {
    return typeof window !== "undefined" && !!(window as unknown as { ethereum?: Eip1193 }).ethereum;
  },

  /** Ask the wallet for its address (shows a permission prompt the first time). */
  async requestAccount(): Promise<Hex> {
    const [account] = (await provider().request({ method: "eth_requestAccounts" })) as Hex[];
    if (!account) throw Errors.wallet("Your wallet did not share a Polygon address.");
    return account;
  },

  async switchToPolygon(): Promise<void> {
    try {
      await provider().request({ method: "wallet_switchEthereumChain", params: [{ chainId: POLYGON_CHAIN_ID }] });
    } catch (e) {
      if ((e as { code?: number }).code === 4902)
        throw Errors.wallet("Polygon is not set up in your wallet. Update Nimiq Pay and try again.", { cause: e });
      throw e;
    }
    // The USDT contract address means something else on other networks, so never send from one.
    const chain = toBigInt(
      await provider()
        .request({ method: "eth_chainId" })
        .catch(() => null),
    );
    if (chain !== null && chain !== BigInt(POLYGON_CHAIN_ID))
      throw Errors.wallet("Your wallet is not on the Polygon network. Switch to Polygon in Nimiq Pay and try again.");
  },

  /** USDT balance in 6-decimal units, or null when the wallet could not tell us. */
  async usdtBalance(owner: Hex): Promise<bigint | null> {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] });
    return toBigInt(
      await provider()
        .request({ method: "eth_call", params: [{ to: USDT_POLYGON, data }, "latest"] })
        .catch(() => null),
    );
  },

  /** POL balance, needed for the network fee, or null when the wallet could not tell us. */
  async gasBalance(owner: Hex): Promise<bigint | null> {
    return toBigInt(
      await provider()
        .request({ method: "eth_getBalance", params: [owner, "latest"] })
        .catch(() => null),
    );
  },

  /**
   * Send `amount` (6-decimal units) of USDT. Returns the transaction hash, or null when the wallet
   * sent the payment but did not hand back a usable hash.
   */
  async sendUsdt(from: Hex, to: Hex, amount: bigint): Promise<Hex | null> {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    const sent = unwrap(
      await provider().request({ method: "eth_sendTransaction", params: [{ from, to: USDT_POLYGON, data, value: "0x0" }] }),
    );
    return typeof sent === "string" && /^0x[0-9a-f]{64}$/i.test(sent) ? (sent as Hex) : null;
  },
};
