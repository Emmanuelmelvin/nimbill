// Checks withdrawals against the real world, without moving money:
//   - storage: the SDK's key counter hands out each index once; swap records round-trip encrypted
//   - Lendaswap: a live quote for every chain/token pair the Withdraw screen offers
//   - RPCs: a real, final USDC transfer on each chain reads as delivered (and only to its recipient)
//   - with --create: creates ONE unpaid swap at Lendaswap and checks it matches what was asked.
//     Unpaid, it simply expires; nothing is spent.
// Uses a throwaway recovery phrase unless WITHDRAW_MNEMONIC is set, and the local embedded
// database (stop `npm run dev` first).
//
//   npm run test:withdraw-live            (storage, quotes and RPCs)
//   npm run test:withdraw-live -- --create
import { Client, InMemorySwapStorage, InMemoryWalletStorage } from "@lendasat/lendaswap-sdk-pure";

if (!process.env.WITHDRAW_MNEMONIC) {
  const throwaway = await Client.builder()
    .withSignerStorage(new InMemoryWalletStorage())
    .withSwapStorage(new InMemorySwapStorage())
    .build();
  process.env.WITHDRAW_MNEMONIC = throwaway.getMnemonic();
}
// Imported after the phrase is set: env.ts reads the environment once, when first imported.
const { createPublicClient, http, parseAbiItem } = await import("viem");
const { arbitrum, mainnet, polygon } = await import("viem/chains");
const { env } = await import("../src/lib/env.ts");
const { CHAINS, tokensFor } = await import("../src/lib/withdraw/chains.ts");
const { checkDelivery } = await import("../src/lib/withdraw/evm.ts");
const { lendaswap } = await import("../src/lib/withdraw/lendaswap.ts");
const { PgSwapStorage, PgWalletStorage } = await import("../src/lib/withdraw/storage.ts");

let failed = 0;
const ok = (c: unknown, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) failed++;
};

// ---- storage ----
const wallet = new PgWalletStorage();
const before = await wallet.getKeyIndex();
const [a, b] = await Promise.all([wallet.incrementKeyIndex(), wallet.incrementKeyIndex()]);
ok(
  a !== b && Math.min(a, b) === before && (await wallet.getKeyIndex()) === before + 2,
  "two swaps created at once get different key indexes",
);
const swaps = new PgSwapStorage();
const record = {
  version: 1,
  swapId: `test_${Date.now()}`,
  keyIndex: 7,
  response: { id: "x", status: "pending", big: BigInt(5) },
  publicKey: "02ab",
  preimage: "aa".repeat(32),
  preimageHash: "bb".repeat(32),
  secretKey: "cc".repeat(32),
  storedAt: 1,
  updatedAt: 1,
};
await swaps.store(record as never);
const back = (await swaps.get(record.swapId)) as unknown as typeof record;
ok(back?.preimage === record.preimage && back.response.big === BigInt(5), "a swap record comes back intact (bigints included)");
const { getDb, schema } = await import("../src/lib/db/index.ts");
const { eq } = await import("drizzle-orm");
const [raw] = await (await getDb()).select().from(schema.withdrawSwaps).where(eq(schema.withdrawSwaps.swapId, record.swapId));
ok(
  raw && !raw.dataEnc.includes(record.preimage) && !raw.dataEnc.includes("secretKey"),
  "the stored swap record is encrypted (no secret in the database)",
);

// ---- Lendaswap quotes, every pair the screen offers ----
for (const chain of CHAINS.filter((c) => c.available)) {
  for (const token of tokensFor(chain, "NIM")) {
    try {
      const q = await lendaswap.quote(chain, token, "10000000"); // 10 USDC / USDT
      const sats = Number(q.net_source_amount);
      ok(
        q.net_target_amount === "10000000" && sats > q.min_amount && sats < q.max_amount,
        `quote ${token.asset} on ${chain.name}: ${sats} sats for 10 ${token.asset}`,
      );
    } catch (e) {
      ok(false, `quote ${token.asset} on ${chain.name}: ${(e as Error).message}`);
    }
  }
}

// ---- delivery check, on a real, already-final USDC transfer on each chain ----
const RPC = {
  polygon: [polygon, env.POLYGON_RPC_URL],
  ethereum: [mainnet, env.ETHEREUM_RPC_URL],
  arbitrum: [arbitrum, env.ARBITRUM_RPC_URL],
} as const;
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
for (const chain of CHAINS.filter((c) => c.available)) {
  const [viemChain, url] = RPC[chain.id as keyof typeof RPC];
  const client = createPublicClient({ chain: viemChain, transport: http(url) });
  const usdc = chain.tokens.find((t) => t.asset === "USDC")!;
  try {
    const finalized = (await client.getBlock({ blockTag: "finalized" })).number;
    const logs = await client.getLogs({
      address: usdc.contract as `0x${string}`,
      event: TRANSFER,
      fromBlock: finalized - BigInt(chain.id === "arbitrum" ? 200 : 2),
      toBlock: finalized,
    });
    const log = logs.find((l) => l.args.value && l.args.value > BigInt(0));
    if (!log) {
      ok(false, `${chain.name}: no recent USDC transfer to test with`);
      continue;
    }
    const d = await checkDelivery(chain.id, log.transactionHash, usdc.contract, log.args.to!);
    ok(d.state === "final" && d.amount >= log.args.value!, `${chain.name}: a final USDC transfer reads as delivered (${d.state})`);
    const other = await checkDelivery(chain.id, log.transactionHash, usdc.contract, "0x52908400098527886E0F7030069857D2E4169EE7");
    ok(other.state === "failed", `${chain.name}: the same transfer is NOT a delivery to someone else`);
  } catch (e) {
    ok(false, `${chain.name} RPC: ${(e as Error).message}`);
  }
}

// ---- one real, unpaid swap ----
if (process.argv.includes("--create")) {
  const chain = CHAINS.find((c) => c.id === "polygon")!;
  const token = chain.tokens.find((t) => t.asset === "USDC")!;
  const destination = "0x52908400098527886E0F7030069857D2E4169EE7";
  const swap = await lendaswap.create(chain, token, "2000000", destination); // 2 USDC
  ok(swap.evm_chain_id === 137 && swap.target_amount === "2000000", "created swap: Polygon, 2 USDC");
  ok(!swap.target_evm_address || swap.target_evm_address.toLowerCase() === destination.toLowerCase(), "created swap: our destination");
  ok(/^lnbc\d+/.test(swap.bolt11_invoice), `created swap has a mainnet Lightning invoice for ${swap.source_amount} sats`);
  const stored = await swaps.get(swap.id);
  ok(
    stored?.preimageHash && swap.hash_lock.toLowerCase().endsWith(stored.preimageHash.toLowerCase()),
    "its secret is in our (encrypted) storage, matching the hash lock",
  );
  const again = await lendaswap.get(swap.id);
  ok(again.status === "pending", `reading it back: status ${again.status}`);
  console.log(
    `  swap ${swap.id}, invoice expires ${swap.invoice_expires_at ? new Date(swap.invoice_expires_at * 1000).toISOString() : "?"} (left unpaid)`,
  );
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nAll live withdraw checks passed");
process.exit(0);
