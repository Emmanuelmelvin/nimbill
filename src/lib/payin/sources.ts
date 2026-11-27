import { sha256 } from "@noble/hashes/sha2.js";
import { getAddress, isAddress } from "viem";
import type { ChainId } from "../withdraw/chains";

// "Pay from another chain": the coins a client can pay an invoice with when they don't have Nimiq
// Pay. NEAR Intents' 1Click API (lib/payin/oneclick.ts) swaps them into USDT on Polygon and sends
// that straight to the merchant's Polygon address, the same USDT a Nimiq Pay payment arrives as.
// Shared by the pay screen and the server, so both offer and accept exactly the same list.
//
// `assetId` is 1Click's id for the token (GET https://1click.chaindefuser.com/v0/tokens).
//
// Dollar coins (USDT, USDC) barely move against the USDT the merchant receives. Native coins (SOL,
// ETH, BTC…) do: the amount to send is fixed when the payment address is made, so it carries a
// bigger buffer and the client gets less time to send. Whatever the swap doesn't use goes back to
// the client's refund address.

export type Coin = "USDT" | "USDC" | "SOL" | "ETH" | "BNB" | "TRX" | "POL" | "AVAX" | "BTC" | "LTC" | "DOGE";
export type AddressKind = "evm" | "tron" | "solana" | "bitcoin" | "litecoin" | "dogecoin";

export type PayinSource = {
  /** Our id, e.g. "tron-usdt". Stored on each payment. */
  id: string;
  asset: Coin;
  /** The network the client sends on, e.g. "Tron". */
  chain: string;
  /** "stable": a dollar coin. "native": a coin whose price moves. */
  kind: "stable" | "native";
  /** The chain's logo shown in the corner of the coin's logo, when the coin isn't that chain's own. */
  badge: ChainId | null;
  addressKind: AddressKind;
  assetId: string;
  decimals: number;
  /** Decimals the amount to send is rounded up to, so it is easy to type into an exchange. */
  showDecimals: number;
  /** The buffer 1Click adds to the amount to send, in basis points (100 = 1%). */
  slippageBps: number;
  /** How long the client has to send, in minutes. */
  depositWindowMin: number;
  /**
   * The smallest payment, in US dollars, 1Click currently takes from this chain (it calls this a
   * temporary limit; checked 2026-11-27, with or without a partner key). Used to start small
   * invoices on another network; 1Click's own answer is what counts, so it never blocks a payment.
   */
  minUsd?: number;
  /** Where the client can look up their deposit on the chain they paid from. */
  explorerTx: (hash: string) => string;
};

const tronTx = (h: string) => `https://tronscan.org/#/transaction/${h}`;
const bscTx = (h: string) => `https://bscscan.com/tx/${h}`;
const solTx = (h: string) => `https://solscan.io/tx/${h}`;
const ethTx = (h: string) => `https://etherscan.io/tx/${h}`;
const arbTx = (h: string) => `https://arbiscan.io/tx/${h}`;
const baseTx = (h: string) => `https://basescan.org/tx/${h}`;
const polTx = (h: string) => `https://polygonscan.com/tx/${h}`;
const avaxTx = (h: string) => `https://snowtrace.io/tx/${h}`;
const btcTx = (h: string) => `https://mempool.space/tx/${h}`;
const ltcTx = (h: string) => `https://litecoinspace.org/tx/${h}`;
const dogeTx = (h: string) => `https://dogechain.info/tx/${h}`;

type Base = Pick<PayinSource, "id" | "asset" | "chain" | "badge" | "addressKind" | "assetId" | "decimals" | "explorerTx" | "minUsd">;

/** A dollar coin: 0.5% buffer, 30 minutes to send, rounded to the cent. */
const stable = (s: Base): PayinSource => ({ ...s, kind: "stable", showDecimals: 2, slippageBps: 50, depositWindowMin: 30 });
/** A coin whose price moves: 2% buffer and 20 minutes on fast chains; 3% and 60 minutes where blocks are slow. */
const native = (s: Base & { showDecimals: number; slow?: boolean }): PayinSource => ({
  ...s,
  kind: "native",
  slippageBps: s.slow ? 300 : 200,
  depositWindowMin: s.slow ? 60 : 20,
});

export const PAYIN_SOURCES: readonly PayinSource[] = [
  // Dollar coins first: the safest way to pay from another chain.
  stable({
    id: "tron-usdt",
    asset: "USDT",
    chain: "Tron",
    badge: "tron",
    addressKind: "tron",
    decimals: 6,
    explorerTx: tronTx,
    assetId: "nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near",
    minUsd: 100,
  }),
  stable({
    id: "bnb-usdt",
    asset: "USDT",
    chain: "BNB Chain",
    badge: "bnb",
    addressKind: "evm",
    decimals: 18,
    explorerTx: bscTx,
    assetId: "nep141:bnb-0x55d398326f99059ff775485246999027b3197955.omdep.near",
  }),
  stable({
    id: "bnb-usdc",
    asset: "USDC",
    chain: "BNB Chain",
    badge: "bnb",
    addressKind: "evm",
    decimals: 18,
    explorerTx: bscTx,
    assetId: "nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near",
  }),
  stable({
    id: "solana-usdt",
    asset: "USDT",
    chain: "Solana",
    badge: "solana",
    addressKind: "solana",
    decimals: 6,
    explorerTx: solTx,
    assetId: "nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near",
  }),
  stable({
    id: "solana-usdc",
    asset: "USDC",
    chain: "Solana",
    badge: "solana",
    addressKind: "solana",
    decimals: 6,
    explorerTx: solTx,
    assetId: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near",
  }),
  stable({
    id: "ethereum-usdt",
    asset: "USDT",
    chain: "Ethereum",
    badge: "ethereum",
    addressKind: "evm",
    decimals: 6,
    explorerTx: ethTx,
    assetId: "nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near",
  }),
  stable({
    id: "ethereum-usdc",
    asset: "USDC",
    chain: "Ethereum",
    badge: "ethereum",
    addressKind: "evm",
    decimals: 6,
    explorerTx: ethTx,
    assetId: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near",
  }),
  stable({
    id: "arbitrum-usdt",
    asset: "USDT",
    chain: "Arbitrum",
    badge: "arbitrum",
    addressKind: "evm",
    decimals: 6,
    explorerTx: arbTx,
    assetId: "nep141:arb-0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9.omft.near",
  }),
  stable({
    id: "arbitrum-usdc",
    asset: "USDC",
    chain: "Arbitrum",
    badge: "arbitrum",
    addressKind: "evm",
    decimals: 6,
    explorerTx: arbTx,
    assetId: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near",
  }),
  stable({
    id: "base-usdc",
    asset: "USDC",
    chain: "Base",
    badge: "base",
    addressKind: "evm",
    decimals: 6,
    explorerTx: baseTx,
    assetId: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
  }),
  stable({
    id: "polygon-usdc",
    asset: "USDC",
    chain: "Polygon",
    badge: "polygon",
    addressKind: "evm",
    decimals: 6,
    explorerTx: polTx,
    assetId: "nep141:pol-0x3c499c542cef5e3811e1192ce70d8cc03d5c3359.omdep.near",
  }),
  // Native coins.
  native({
    id: "bitcoin-btc",
    asset: "BTC",
    chain: "Bitcoin",
    badge: null,
    addressKind: "bitcoin",
    decimals: 8,
    showDecimals: 6,
    slow: true,
    explorerTx: btcTx,
    assetId: "nep141:btc.omft.near",
  }),
  native({
    id: "ethereum-eth",
    asset: "ETH",
    chain: "Ethereum",
    badge: null,
    addressKind: "evm",
    decimals: 18,
    showDecimals: 6,
    explorerTx: ethTx,
    assetId: "nep141:eth.omft.near",
  }),
  native({
    id: "arbitrum-eth",
    asset: "ETH",
    chain: "Arbitrum",
    badge: "arbitrum",
    addressKind: "evm",
    decimals: 18,
    showDecimals: 6,
    explorerTx: arbTx,
    assetId: "nep141:arb.omft.near",
  }),
  native({
    id: "base-eth",
    asset: "ETH",
    chain: "Base",
    badge: "base",
    addressKind: "evm",
    decimals: 18,
    showDecimals: 6,
    explorerTx: baseTx,
    assetId: "nep141:base.omft.near",
  }),
  native({
    id: "solana-sol",
    asset: "SOL",
    chain: "Solana",
    badge: null,
    addressKind: "solana",
    decimals: 9,
    showDecimals: 4,
    explorerTx: solTx,
    assetId: "nep141:sol.omft.near",
  }),
  native({
    id: "bnb-bnb",
    asset: "BNB",
    chain: "BNB Chain",
    badge: null,
    addressKind: "evm",
    decimals: 18,
    showDecimals: 5,
    explorerTx: bscTx,
    assetId: "nep141:bnb.omdep.near",
  }),
  native({
    id: "tron-trx",
    asset: "TRX",
    chain: "Tron",
    badge: null,
    addressKind: "tron",
    decimals: 6,
    showDecimals: 2,
    explorerTx: tronTx,
    assetId: "nep141:tron.omft.near",
    minUsd: 100,
  }),
  native({
    id: "polygon-pol",
    asset: "POL",
    chain: "Polygon",
    badge: null,
    addressKind: "evm",
    decimals: 18,
    showDecimals: 2,
    explorerTx: polTx,
    assetId: "nep141:pol.omdep.near",
  }),
  native({
    id: "avalanche-avax",
    asset: "AVAX",
    chain: "Avalanche",
    badge: null,
    addressKind: "evm",
    decimals: 18,
    showDecimals: 3,
    explorerTx: avaxTx,
    assetId: "nep141:avax.omdep.near",
  }),
  native({
    id: "litecoin-ltc",
    asset: "LTC",
    chain: "Litecoin",
    badge: null,
    addressKind: "litecoin",
    decimals: 8,
    showDecimals: 4,
    slow: true,
    explorerTx: ltcTx,
    assetId: "nep141:ltc.omft.near",
  }),
  native({
    id: "dogecoin-doge",
    asset: "DOGE",
    chain: "Dogecoin",
    badge: null,
    addressKind: "dogecoin",
    decimals: 8,
    showDecimals: 1,
    slow: true,
    explorerTx: dogeTx,
    assetId: "nep141:doge.omft.near",
  }),
];

/** What every payment turns into: USDT on Polygon, the token NimBill already checks invoices against. */
export const POLYGON_USDT_ASSET_ID = "nep141:pol-0xc2132d05d31c914a87c6611c10748aeb04b58e8f.omdep.near";

export const PAYIN_SOURCE_IDS = PAYIN_SOURCES.map((s) => s.id) as [string, ...string[]];

export function getPayinSource(id: string): PayinSource | undefined {
  return PAYIN_SOURCES.find((s) => s.id === id);
}

/** "USDT on Tron", "ETH on Arbitrum", or just "BTC" for a coin on its own chain. */
export const sourceLabel = (s: PayinSource) => (s.badge ? `${s.asset} on ${s.chain}` : s.asset);

/** The coin to offer first for a payment of about `usd` dollars: the first one with no minimum above it. */
export function defaultSourceFor(usd: number | null): PayinSource {
  if (usd === null) return PAYIN_SOURCES[0];
  return PAYIN_SOURCES.find((s) => !s.minUsd || s.minUsd <= usd) ?? PAYIN_SOURCES[0];
}

/** "USDT on BNB Chain or Solana": dollar coins on other networks with no minimum, to suggest instead of `s`. */
export function alternativesTo(s: PayinSource): string {
  const chains = [
    ...new Set(
      PAYIN_SOURCES.filter((o) => o.kind === "stable" && o.asset === "USDT" && !o.minUsd && o.chain !== s.chain).map((o) => o.chain),
    ),
  ];
  return `USDT on ${chains.slice(0, 2).join(" or ")}`;
}

/** What to tell the client when `s` needs at least `min` dollars and their payment is smaller. */
export const minimumMessage = (s: PayinSource, min: number | string) =>
  `${sourceLabel(s)} needs at least $${min} right now. Pick another network, such as ${alternativesTo(s)}.`;

// ---------- refund address ----------

export type RefundCheck = { ok: true; address: string } | { ok: false; message: string };

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(s: string): Uint8Array | null {
  let n = BigInt(0);
  for (const c of s) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * BigInt(58) + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > BigInt(0)) {
    bytes.unshift(Number(n % BigInt(256)));
    n /= BigInt(256);
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** The version byte of a 25-byte base58check address (version + 20 bytes + checksum), or null. */
function base58CheckVersion(s: string): number | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{25,35}$/.test(s)) return null;
  const b = base58Decode(s);
  if (!b || b.length !== 25) return null;
  const check = sha256(sha256(b.subarray(0, 21)));
  return check.subarray(0, 4).every((x, i) => x === b[21 + i]) ? b[0] : null;
}

/** Tron: base58check of 0x41 + 20 bytes, starting with "T". */
const isTronAddress = (s: string) => s.startsWith("T") && base58CheckVersion(s) === 0x41;

/** Solana: 32 bytes in base58. */
function isSolanaAddress(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  return base58Decode(s)?.length === 32;
}

// Bech32 / bech32m (BIP-173, BIP-350): "bc1…" and "ltc1…" addresses.
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i];
  }
  return chk >>> 0;
}

/** Whether `s` is a valid segwit address for `hrp` ("bc", "ltc"), checksum and program length included. */
function isSegwitAddress(s: string, hrp: string): boolean {
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return false;
  const lower = s.toLowerCase();
  if (!lower.startsWith(`${hrp}1`) || lower.length > 90) return false;
  const data: number[] = [];
  for (const c of lower.slice(hrp.length + 1)) {
    const v = BECH32.indexOf(c);
    if (v < 0) return false;
    data.push(v);
  }
  if (data.length < 7) return false;
  const expanded = [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data];
  const check = polymod(expanded);
  const version = data[0];
  if (version > 16) return false;
  // Version 0 uses bech32 (checksum constant 1), versions 1-16 use bech32m.
  if (check !== (version === 0 ? 1 : BECH32M_CONST)) return false;
  // The witness program, regrouped from 5-bit to 8-bit values.
  let acc = 0;
  let bits = 0;
  const program: number[] = [];
  for (const v of data.slice(1, -6)) {
    acc = ((acc << 5) | v) & 0xfff; // only the bits not yet taken out are needed
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      program.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || (acc << (8 - bits)) & 0xff) return false;
  if (program.length < 2 || program.length > 40) return false;
  return version !== 0 || program.length === 20 || program.length === 32;
}

/** Bitcoin-style chains: the base58 version bytes they use, and their segwit prefix. */
const UTXO: Record<"bitcoin" | "litecoin" | "dogecoin", { versions: number[]; hrp: string | null; hint: string }> = {
  bitcoin: { versions: [0x00, 0x05], hrp: "bc", hint: "Bitcoin addresses start with bc1, 1 or 3." },
  litecoin: { versions: [0x30, 0x32, 0x05], hrp: "ltc", hint: "Litecoin addresses start with ltc1, L or M." },
  dogecoin: { versions: [0x1e, 0x16], hrp: null, hint: "Dogecoin addresses start with D." },
};

/**
 * Checks the address a payment goes back to if it can't go through. Money refunded to an address
 * on the wrong chain is usually lost, so anything that is not clearly right is refused.
 */
export function checkRefundAddress(source: PayinSource, raw: string): RefundCheck {
  const input = raw.trim();
  if (!input) return { ok: false, message: `Paste your ${source.chain} address.` };
  switch (source.addressKind) {
    case "evm":
      if (!/^0x[0-9a-fA-F]{40}$/.test(input)) {
        return { ok: false, message: `That is not a ${source.chain} address. It starts with 0x and is 42 characters long.` };
      }
      if (!isAddress(input, { strict: true })) return { ok: false, message: "This address has a typo. Copy it again." };
      if (/^0x0{40}$/i.test(input)) return { ok: false, message: "That address can't receive money back. Use your own address." };
      return { ok: true, address: getAddress(input) };
    case "tron":
      return isTronAddress(input)
        ? { ok: true, address: input }
        : { ok: false, message: "That is not a Tron address. Tron addresses start with T and are 34 characters long." };
    case "solana":
      return isSolanaAddress(input) ? { ok: true, address: input } : { ok: false, message: "That is not a Solana address." };
    default: {
      const u = UTXO[source.addressKind];
      const version = base58CheckVersion(input);
      const ok = (version !== null && u.versions.includes(version)) || (!!u.hrp && isSegwitAddress(input, u.hrp));
      // Segwit addresses are case-insensitive; keep them lower case like wallets show them.
      if (ok) return { ok: true, address: u.hrp && input.toLowerCase().startsWith(`${u.hrp}1`) ? input.toLowerCase() : input };
      return { ok: false, message: `That is not a ${source.chain} address, or it has a typo. ${u.hint}` };
    }
  }
}

// ---------- amounts ----------

/** Smallest units → "150.8", trimmed, for showing and copying. */
export function formatUnits(units: string, decimals: number): string {
  const v = BigInt(units);
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

/**
 * Round an amount the client must send up to `places` decimals, so it is easy to type into an
 * exchange. Sending a little more is safe: whatever the swap doesn't need is sent back.
 */
export function roundUpTo(units: string, decimals: number, places: number): string {
  if (decimals <= places) return units;
  const step = BigInt(10) ** BigInt(decimals - places);
  const v = BigInt(units);
  return (((v + step - BigInt(1)) / step) * step).toString();
}
