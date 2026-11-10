"use client";
// Client for the Polygon wallet that Nimiq Pay injects as `window.ethereum` (EIP-1193).
// Used for USDT payments and to read the merchant's Polygon address.
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { Errors } from "@/lib/errors";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

const POLYGON_CHAIN_ID = "0x89";
export const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";

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
  },

  async usdtBalance(owner: Hex): Promise<bigint> {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] });
    const result = (await provider().request({ method: "eth_call", params: [{ to: USDT_POLYGON, data }, "latest"] })) as Hex;
    return BigInt(result || "0x0");
  },

  /** POL balance, needed for the network fee. */
  async gasBalance(owner: Hex): Promise<bigint> {
    return BigInt(((await provider().request({ method: "eth_getBalance", params: [owner, "latest"] })) as Hex) || "0x0");
  },

  /** Send `amount` (6-decimal units) of USDT. Returns the transaction hash. */
  async sendUsdt(from: Hex, to: Hex, amount: bigint): Promise<Hex> {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    return (await provider().request({ method: "eth_sendTransaction", params: [{ from, to: USDT_POLYGON, data, value: "0x0" }] })) as Hex;
  },
};
