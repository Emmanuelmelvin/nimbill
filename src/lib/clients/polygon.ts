import "server-only";
import { BaseError, createPublicClient, decodeEventLog, erc20Abi, getAddress, http, parseAbiItem, TransactionReceiptNotFoundError, type Hash } from "viem";
import { polygon as polygonChain } from "viem/chains";
import { env } from "../env";
import { Errors } from "../errors";
import { logger } from "../logger";

// Polygon PoS (USDT payments), through viem's typed RPC client: retries, timeouts and request batching.

const SERVICE = "polygon-rpc";
export const USDT_POLYGON = getAddress("0xc2132D05D31c914a87C6611C10748AEb04B58e8F");
const MIN_CONFIRMATIONS = 5;
const MAX_LOG_BLOCKS = 9_000; // public Polygon RPCs cap eth_getLogs at 10,000 blocks
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const client = createPublicClient({
  chain: polygonChain,
  transport: http(env.POLYGON_RPC_URL, { timeout: 10_000, retryCount: 2, batch: { wait: 10 } }),
});

/** Run a viem call; turn its errors into UPSTREAM AppErrors. */
async function rpc<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof TransactionReceiptNotFoundError) throw e;
    const short = e instanceof BaseError ? e.shortMessage : String(e);
    logger.warn("polygon rpc failed", { what, error: short });
    throw Errors.upstream(SERVICE, `Polygon RPC failed: ${what}`, { cause: e, details: { what, error: short } });
  }
}

export type UsdtTransfer = { hash: string; from: string; to: string; value: bigint; timestamp: number; confirmed: boolean };

export type UsdtTxResult = { status: "pending" } | { status: "reverted" } | { status: "mined"; transfers: UsdtTransfer[] };

const gc = globalThis as unknown as { __nimbillMsPerBlock?: { at: number; value: number } };

/** Latest block plus the measured average block time (Polygon's block time has changed over the years). */
async function clock(): Promise<{ number: number; ts: number; msPerBlock: number }> {
  const latest = await rpc("latest block", () => client.getBlock({ blockTag: "latest" }));
  const number = Number(latest.number);
  const ts = Number(latest.timestamp) * 1000;
  let ms = gc.__nimbillMsPerBlock;
  if (!ms || Date.now() - ms.at > 3_600_000) {
    const sample = 10_000;
    const old = await rpc("sample block", () => client.getBlock({ blockNumber: BigInt(number - sample) }));
    ms = { at: Date.now(), value: Math.max(500, (ts - Number(old.timestamp) * 1000) / sample) };
    gc.__nimbillMsPerBlock = ms;
  }
  return { number, ts, msPerBlock: ms.value };
}

const toMs = (t: bigint | string | number) => Number(typeof t === "string" ? BigInt(t) : t) * 1000;

export const polygon = {
  /** The USDT transfers in a transaction: pending if not mined yet, reverted if it failed. */
  async getUsdtTransfers(hash: string): Promise<UsdtTxResult> {
    let receipt;
    try {
      receipt = await rpc("transaction receipt", () => client.getTransactionReceipt({ hash: hash as Hash }));
    } catch (e) {
      if (e instanceof TransactionReceiptNotFoundError) return { status: "pending" };
      throw e;
    }
    if (receipt.status !== "success") return { status: "reverted" };
    const [block, head] = await Promise.all([
      rpc("block", () => client.getBlock({ blockNumber: receipt.blockNumber })),
      rpc("block number", () => client.getBlockNumber()),
    ]);
    const confirmed = Number(head - receipt.blockNumber) >= MIN_CONFIRMATIONS;
    const timestamp = toMs(block.timestamp);
    const transfers: UsdtTransfer[] = [];
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== USDT_POLYGON) continue;
      try {
        const ev = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (ev.eventName !== "Transfer") continue;
        transfers.push({ hash, from: ev.args.from, to: ev.args.to, value: ev.args.value, timestamp, confirmed });
      } catch {
        /* not a Transfer */
      }
    }
    return { status: "mined", transfers };
  },

  /**
   * USDT transfers received by `to` whose block time falls inside one of `windows` (ms timestamps).
   * Used to find payments when the payer closed the app before we saw the transaction hash.
   */
  async getUsdtTransfersTo(to: string, windows: { fromMs: number; toMs: number }[]): Promise<UsdtTransfer[]> {
    if (!windows.length) return [];
    const c = await clock();
    const blockAt = (t: number) => c.number - Math.ceil((c.ts - t) / c.msPerBlock);

    // Time windows → padded block ranges (block time is an estimate), merged and split to the RPC limit.
    const ranges = windows
      .map((w) => {
        const from = blockAt(w.fromMs);
        const pad = 300 + Math.ceil((c.number - from) * 0.05);
        return [Math.max(0, from - pad), Math.min(c.number, blockAt(w.toMs) + pad)] as [number, number];
      })
      .filter(([a, b]) => a <= b)
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    const chunks: [number, number][] = [];
    for (const [a, b] of merged) for (let s = a; s <= b; s += MAX_LOG_BLOCKS) chunks.push([s, Math.min(b, s + MAX_LOG_BLOCKS - 1)]);

    const recipient = getAddress(to);
    const logs = (
      await Promise.all(
        chunks.map(([a, b]) =>
          rpc("transfer logs", () => client.getLogs({ address: USDT_POLYGON, event: TRANSFER, args: { to: recipient }, fromBlock: BigInt(a), toBlock: BigInt(b) })),
        ),
      )
    ).flat();

    const out: UsdtTransfer[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key) || !log.blockNumber || !log.transactionHash) continue;
      seen.add(key);
      const blockNumber = log.blockNumber;
      const ts = log.blockTimestamp != null ? toMs(log.blockTimestamp) : toMs((await rpc("block", () => client.getBlock({ blockNumber }))).timestamp);
      if (!windows.some((w) => ts >= w.fromMs && ts <= w.toMs)) continue;
      const { from, to: dest, value } = log.args;
      if (!from || !dest || value === undefined) continue;
      out.push({ hash: log.transactionHash, from, to: dest, value, timestamp: ts, confirmed: c.number - Number(blockNumber) >= MIN_CONFIRMATIONS });
    }
    return out;
  },
};
