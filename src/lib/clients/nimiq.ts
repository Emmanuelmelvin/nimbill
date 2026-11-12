import "server-only";
import { z } from "zod";
import { env } from "../env";
import { AppError, Errors } from "../errors";
import { serviceHttp } from "./shared";

// Nimiq blockchain (JSON-RPC, Albatross). Every call here is a read, so they are safe to retry.

const SERVICE = "nimiq-rpc";
const http = serviceHttp({ service: SERVICE, baseUrl: env.NIMIQ_RPC_URL, timeoutMs: 10_000, retries: 2 });
const writeHttp = serviceHttp({ service: SERVICE, baseUrl: env.NIMIQ_RPC_URL, timeoutMs: 10_000, retries: 0 });

const RpcEnvelope = z.object({
  result: z.object({ data: z.unknown() }).loose().optional(),
  error: z.object({ code: z.number().optional(), message: z.string().optional(), data: z.unknown().optional() }).loose().optional(),
});

export const NimTx = z
  .object({
    hash: z.string(),
    blockNumber: z.number(),
    timestamp: z.number(), // ms
    confirmations: z.number(),
    from: z.string(),
    to: z.string(),
    value: z.number(), // Luna
    recipientData: z.string(), // hex
    executionResult: z.boolean(),
  })
  .loose();
export type NimTx = z.infer<typeof NimTx>;

// `balance` is the active stake. Inactive stake is being unstaked (locked from `inactiveFrom`
// until the reporting window after it has passed); retired stake can be removed to the wallet.
const Staker = z
  .object({
    delegation: z.string(),
    balance: z.number(),
    inactiveBalance: z.number().default(0),
    inactiveFrom: z.number().nullish(),
    retiredBalance: z.number().default(0),
  })
  .loose();
export type NimStaker = z.infer<typeof Staker>;

async function call<T>(method: string, params: unknown[], schema: z.ZodType<T>): Promise<T> {
  const res = await http.post("", { jsonrpc: "2.0", method, params, id: 1 }, { schema: RpcEnvelope });
  if (res.error) {
    const text = String(res.error.data ?? res.error.message ?? "Nimiq RPC error");
    // "Transaction not found", and for stakers "No staker with address: NQ…".
    if (/not found|no staker with address/i.test(text)) throw new AppError("NOT_FOUND", text, { service: SERVICE, expose: false });
    throw Errors.upstream(SERVICE, `Nimiq RPC ${method} failed`, { details: { method, rpcError: res.error } });
  }
  const parsed = schema.safeParse(res.result?.data);
  if (!parsed.success)
    throw Errors.upstream(SERVICE, `Nimiq RPC ${method} returned an unexpected result`, { cause: parsed.error, details: { method } });
  return parsed.data;
}

const isNotFound = (e: unknown) => AppError.is(e) && e.code === "NOT_FOUND";

export const nimiq = {
  /** A transaction by hash, or null if it is not (yet) in a block. */
  async getTransaction(hash: string): Promise<NimTx | null> {
    try {
      return await call("getTransactionByHash", [hash], NimTx);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },

  /** Most recent transactions of an address, newest first. */
  getTransactionsByAddress(address: string, max = 100): Promise<NimTx[]> {
    return call("getTransactionsByAddress", [address, max, null], z.array(NimTx));
  },

  /** Staking position of an address, or null if it is not a staker. */
  async getStaker(address: string): Promise<NimStaker | null> {
    try {
      return await call("getStakerByAddress", [address], Staker);
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },

  /** Height of the latest block. */
  getBlockNumber(): Promise<number> {
    return call("getBlockNumber", [], z.number());
  },

  /** First block at which stake made inactive at `block` can be retired. */
  getBlockAfterReportingWindow(block: number): Promise<number> {
    return call("getBlockAfterReportingWindow", [block], z.number());
  },

  /** Broadcast a pre-signed raw transaction (hex) to the Nimiq network. Returns the tx hash. */
  async sendRawTransaction(rawTxHex: string): Promise<string> {
    const res = await writeHttp.post(
      "",
      { jsonrpc: "2.0", method: "sendRawTransaction", params: [rawTxHex], id: 1 },
      { schema: RpcEnvelope },
    );
    if (res.error) {
      const text = String(res.error.data ?? res.error.message ?? "Transaction rejected by the Nimiq network");
      throw Errors.badRequest(text, { details: { rpcError: res.error } });
    }
    const parsed = z.string().safeParse(res.result?.data);
    if (!parsed.success) throw Errors.upstream(SERVICE, "Nimiq RPC sendRawTransaction returned an unexpected result");
    return parsed.data;
  },
};

// ---------- helpers ----------

export function decodeData(hex: string): string {
  try {
    return Buffer.from(hex || "", "hex").toString("utf8");
  } catch {
    return "";
  }
}

export const sameNimAddress = (a: string, b: string) => a.replace(/\s/g, "").toUpperCase() === b.replace(/\s/g, "").toUpperCase();
