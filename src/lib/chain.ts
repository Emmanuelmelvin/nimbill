import "server-only";
import { decodeEventLog, erc20Abi, getAddress, type Hex } from "viem";

// ---------- Nimiq ----------

const NIMIQ_RPC = process.env.NIMIQ_RPC_URL || "https://rpc.nimiqwatch.com";

export type NimTx = {
  hash: string;
  blockNumber: number;
  timestamp: number; // ms
  confirmations: number;
  from: string;
  to: string;
  value: number; // Luna
  recipientData: string; // hex
  executionResult: boolean;
};

async function nimRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(NIMIQ_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Nimiq RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.data || json.error.message || "Nimiq RPC error");
    (err as Error & { rpcNotFound?: boolean }).rpcNotFound = /not found/i.test(String(json.error.data));
    throw err;
  }
  return json.result.data as T;
}

/** Returns null if the transaction is not (yet) in a block. */
export async function getNimTransaction(hash: string): Promise<NimTx | null> {
  try {
    return await nimRpc<NimTx>("getTransactionByHash", [hash]);
  } catch (e) {
    if ((e as { rpcNotFound?: boolean }).rpcNotFound) return null;
    throw e;
  }
}

export async function getNimTransactionsByAddress(address: string, max = 100): Promise<NimTx[]> {
  return nimRpc<NimTx[]>("getTransactionsByAddress", [address, max, null]);
}

export async function getNimStaker(address: string): Promise<{ delegation: string; balance: number } | null> {
  try {
    return await nimRpc("getStakerByAddress", [address]);
  } catch {
    return null;
  }
}

export function decodeData(hex: string): string {
  try {
    return Buffer.from(hex || "", "hex").toString("utf8");
  } catch {
    return "";
  }
}

export const sameNimAddress = (a: string, b: string) => a.replace(/\s/g, "").toUpperCase() === b.replace(/\s/g, "").toUpperCase();

// ---------- Polygon (USDT) ----------

const POLYGON_RPC = process.env.POLYGON_RPC_URL || "https://polygon-bor-rpc.publicnode.com";
export const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const MIN_POLYGON_CONFIRMATIONS = 5;

async function evmRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(POLYGON_RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Polygon RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "Polygon RPC error");
  return json.result as T;
}

export type UsdtTransfer = { hash: string; from: string; to: string; value: bigint; timestamp: number; confirmed: boolean };

/** Returns the USDT transfers in a Polygon transaction, or null if it is not mined yet. Throws if it reverted. */
export async function getUsdtTransfers(hash: string): Promise<UsdtTransfer[] | null> {
  type Receipt = { status: Hex; blockNumber: Hex; logs: { address: string; topics: Hex[]; data: Hex }[] };
  const receipt = await evmRpc<Receipt | null>("eth_getTransactionReceipt", [hash]);
  if (!receipt) return null;
  if (receipt.status !== "0x1") throw new Error("This USDT transaction failed on-chain.");
  const [block, head] = await Promise.all([
    evmRpc<{ timestamp: Hex }>("eth_getBlockByNumber", [receipt.blockNumber, false]),
    evmRpc<Hex>("eth_blockNumber", []),
  ]);
  const confirmed = Number(BigInt(head) - BigInt(receipt.blockNumber)) >= MIN_POLYGON_CONFIRMATIONS;
  const timestamp = Number(BigInt(block.timestamp)) * 1000;
  const out: UsdtTransfer[] = [];
  for (const log of receipt.logs) {
    if (getAddress(log.address) !== getAddress(USDT_POLYGON)) continue;
    try {
      const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName !== "Transfer") continue;
      const { from, to, value } = ev.args as { from: string; to: string; value: bigint };
      out.push({ hash, from, to, value, timestamp, confirmed });
    } catch {
      /* not a Transfer */
    }
  }
  return out;
}

// ---------- Validators (staking) ----------

export type Validator = { name: string; address: string; fee: number; payoutType: string; score: number; logo?: string };

const g = globalThis as unknown as { __nimbillValidators?: { at: number; list: Validator[] } };

export async function getValidators(): Promise<Validator[]> {
  const cached = g.__nimbillValidators;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.list;
  const urls = [
    process.env.VALIDATORS_API_URL,
    "https://validators-api-mainnet.nuxt.dev/api/v1/validators",
    "https://validators-api-mainnet.pages.dev/api/v1/validators",
  ].filter(Boolean) as string[];
  let res: Response | null = null;
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        res = r;
        break;
      }
    } catch {
      /* try next */
    }
  }
  if (!res) {
    if (cached) return cached.list;
    throw new Error("Validator list is unavailable right now.");
  }
  type Raw = { name: string; address: string; fee: number | null; payoutType: string; isListed: boolean; score?: { total?: number }; logo?: string };
  const raw = (await res.json()) as Raw[];
  // Only pools pay rewards out to stakers; solo validators keep them.
  const list = raw
    .filter((v) => v.isListed && (v.payoutType === "restake" || v.payoutType === "direct"))
    .map((v) => ({ name: v.name, address: v.address, fee: v.fee ?? 0, payoutType: v.payoutType, score: v.score?.total ?? 0, logo: v.logo }))
    .sort((a, b) => b.score - a.score || a.fee - b.fee)
    .slice(0, 6);
  g.__nimbillValidators = { at: Date.now(), list };
  return list;
}
