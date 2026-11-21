// Unit tests for withdrawals: which chains and tokens are offered, and destination address checks.
import { expect, test } from "bun:test";
import { getAddress } from "viem";
import { checkDestination } from "../src/lib/withdraw/address.ts";
import { CHAINS, findRoute, getChain, offerNimiqPayAddress, tokensFor } from "../src/lib/withdraw/chains.ts";
import { QuoteBody } from "../src/lib/withdraw/schemas.ts";
import { hasExcessiveQuoteDrift, swapCostsMoreThanQuoted } from "../src/lib/withdraw/service.ts";

// Each check is its own test: the condition is worked out in order, then reported.
const ok = (c: unknown, m: string) => test(m, () => expect(c).toBeTruthy());

// ---- chains ----
const live = CHAINS.filter((c) => c.available).map((c) => c.id);
ok(live.join() === "polygon,ethereum,arbitrum", "Polygon, Ethereum and Arbitrum are live");
ok(
  CHAINS.filter((c) => !c.available).every((c) => c.tokens.length === 0),
  "chains that are not live offer no tokens",
);
for (const c of CHAINS)
  for (const t of c.tokens) ok(getAddress(t.contract) === t.contract, `${t.asset} on ${c.name}: contract is checksummed`);
ok(
  CHAINS.flatMap((c) => c.tokens).every((t) => t.decimals === 6),
  "USDC and USDT use 6 decimals everywhere",
);

const polygon = getChain("polygon")!;
ok(
  tokensFor(polygon, "NIM")
    .map((t) => t.asset)
    .join() === "USDC,USDT",
  "paying with NIM: Polygon offers USDC and USDT",
);
ok(
  tokensFor(polygon, "USDT")
    .map((t) => t.asset)
    .join() === "USDC",
  "paying with USDT: Polygon hides USDT (already there)",
);
ok(tokensFor(getChain("ethereum")!, "USDT").length === 2, "paying with USDT: Ethereum still offers both");
ok(tokensFor(getChain("tron")!, "NIM").length === 0, "Tron offers nothing yet");
ok(findRoute("arbitrum", "USDT", "NIM")?.token.asset === "USDT", "findRoute finds USDT on Arbitrum");
ok(findRoute("polygon", "USDT", "USDT") === null, "findRoute refuses USDT → USDT on Polygon");
ok(findRoute("base", "USDC", "NIM") === null, "findRoute refuses a chain that is not live");
ok(findRoute("polygon", "DAI", "NIM") === null, "findRoute refuses an unknown token");
ok(findRoute("mars", "USDC", "NIM") === null, "findRoute refuses an unknown chain");
ok(offerNimiqPayAddress(polygon, "USDT"), "Nimiq Pay address offered for USDT on Polygon");
ok(!offerNimiqPayAddress(polygon, "USDC"), "not yet for USDC on Polygon (to confirm in Nimiq Pay)");
ok(!offerNimiqPayAddress(getChain("ethereum")!, "USDC"), "not on Ethereum");

// ---- addresses ----
const evm = "0x52908400098527886E0F7030069857D2E4169EE7"; // EIP-55 test vector
const good = checkDestination("polygon", `  ${evm}  `);
ok(good.ok && good.address === evm, "a checksummed address passes (trimmed)");
const lower = checkDestination("ethereum", evm.toLowerCase());
ok(lower.ok && lower.address === evm, "an all-lowercase address passes and comes back checksummed");
const typo = checkDestination("polygon", evm.replace("E0F", "e0F"));
ok(!typo.ok && /checksum/.test(typo.message), "a checksum typo is refused");
const zero = checkDestination("arbitrum", "0x0000000000000000000000000000000000000000");
ok(!zero.ok && /zero address/.test(zero.message), "the zero address is refused");
const tron = checkDestination("polygon", "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
ok(!tron.ok && /Tron/.test(tron.message), "a Tron address on Polygon is refused, and named");
const sol = checkDestination("polygon", "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV");
ok(!sol.ok && /Solana/.test(sol.message), "a Solana address on Polygon is refused, and named");
const nim = checkDestination("ethereum", "NQ49 N8MB XYCR XBUP 404C KXKK L49M A7BT F082");
ok(!nim.ok && /Nimiq/.test(nim.message), "a Nimiq address is refused, and named");
const short = checkDestination("polygon", "0x1234");
ok(!short.ok && /42 characters/.test(short.message), "a cut-off address is refused");
ok(!checkDestination("polygon", "   ").ok, "an empty address is refused");
ok(!checkDestination("base", evm).ok, "a chain that is not live is refused");
ok(!checkDestination("mars", evm).ok, "an unknown chain is refused");

// ---- quote drift protection & schema ----
ok(!hasExcessiveQuoteDrift("100000", undefined), "no expectedSendEstimate -> no drift flagged");
ok(!hasExcessiveQuoteDrift("102000", "100000"), "2% upward move is within MAX_QUOTE_DRIFT");
ok(hasExcessiveQuoteDrift("102001", "100000"), ">2% upward move is flagged by hasExcessiveQuoteDrift");
ok(!hasExcessiveQuoteDrift("95000", "100000"), "downward move (cheaper for user) is never flagged");
ok(!swapCostsMoreThanQuoted("10200", 10000), "an invoice within 2% of the quoted sats is accepted");
ok(swapCostsMoreThanQuoted("10201", 10000), "an invoice more than 2% above the quoted sats is refused");
ok(!swapCostsMoreThanQuoted("9000", 10000), "a cheaper invoice is accepted");
ok(swapCostsMoreThanQuoted("not-a-number", 10000), "an unreadable invoice amount is refused");
ok(
  QuoteBody.safeParse({
    payWith: "NIM",
    chain: "polygon",
    asset: "USDC",
    receive: "10",
    destination: evm,
    expectedSendEstimate: "250000000",
  }).success,
  "QuoteBody accepts optional expectedSendEstimate",
);
