import "server-only";
import {
  BaseError,
  createPublicClient,
  decodeEventLog,
  erc20Abi,
  getAddress,
  http,
  TransactionReceiptNotFoundError,
  type Hash,
} from "viem";
import { arbitrum, mainnet, polygon } from "viem/chains";
import { env } from "../env";
import { Errors } from "../errors";
import type { ChainId } from "./chains";

// Reads the destination chain to confirm a withdrawal really arrived. A withdrawal is only marked
// delivered once the claim transaction is in a FINALIZED block and moved the stablecoin to the
// user's address: a provider's word or an unconfirmed transaction is not enough.

const transport = (url: string) => http(url, { timeout: 10_000, retryCount: 2 });
const CLIENTS = {
  polygon: createPublicClient({ chain: polygon, transport: transport(env.POLYGON_RPC_URL) }),
  ethereum: createPublicClient({ chain: mainnet, transport: transport(env.ETHEREUM_RPC_URL) }),
  arbitrum: createPublicClient({ chain: arbitrum, transport: transport(env.ARBITRUM_RPC_URL) }),
} as const;

export type Delivery =
  | { state: "pending"; note: string } // not mined yet, or not final yet
  | { state: "failed"; reason: string }
  | { state: "final"; amount: bigint }; // smallest units that reached the destination

export async function checkDelivery(chainId: ChainId, txHash: string, tokenContract: string, destination: string): Promise<Delivery> {
  const client = CLIENTS[chainId as keyof typeof CLIENTS];
  if (!client) throw Errors.internal(null, `No RPC for chain ${chainId}`);
  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hash });
    if (receipt.status !== "success") return { state: "failed", reason: "The claim transaction failed on-chain." };
    const token = getAddress(tokenContract);
    const to = getAddress(destination);
    let amount = BigInt(0);
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== token) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Transfer" && getAddress(ev.args.to) === to) amount += ev.args.value;
      } catch {
        // not a Transfer
      }
    }
    if (amount === BigInt(0)) return { state: "failed", reason: "The claim did not send the token to the destination address." };
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (receipt.blockNumber > finalized.number) return { state: "pending", note: "Confirmed, waiting for it to be final." };
    return { state: "final", amount };
  } catch (e) {
    if (e instanceof TransactionReceiptNotFoundError) return { state: "pending", note: "Waiting for the transaction to be mined." };
    const short = e instanceof BaseError ? e.shortMessage : String(e);
    throw Errors.upstream(`${chainId}-rpc`, `${chainId} RPC failed`, { cause: e, details: { error: short } });
  }
}
