// Where a crypto withdrawal can arrive: each chain, the tokens it takes, and whether it is live yet.
// Shared by the Withdraw screen and the server, so both list and accept exactly the same pairs.

export type ChainId = "polygon" | "ethereum" | "arbitrum" | "base" | "optimism" | "solana" | "tron" | "bnb" | "avalanche";
export type Asset = "USDC" | "USDT";
/** What the user pays with: their NIM, or their USDT on Polygon. */
export type PayWith = "NIM" | "USDT";
export type AddressKind = "evm" | "solana" | "tron";

export type Token = {
  asset: Asset;
  /** Contract address on this chain. */
  contract: string;
  decimals: number;
};

export type Chain = {
  id: ChainId;
  name: string;
  addressKind: AddressKind;
  /** EVM chain id; null for non-EVM chains. */
  evmChainId: number | null;
  /** Live for withdrawals. Others are listed, disabled, as "Soon". */
  available: boolean;
  tokens: Token[];
  explorerTx: (hash: string) => string;
  /** Nimiq Pay shows this chain's balance for these tokens, so "Use my Nimiq Pay address" is offered. */
  nimiqPayShows: Asset[];
};

// Token contracts for the live chains are the ones Lendaswap lists (api.lendaswap.com/tokens).
// On Polygon and Arbitrum, Lendaswap calls USDT "USDT0"; on Polygon it is the same contract
// NimBill already uses for USDT payments (lib/client/wallet.ts).
export const CHAINS: readonly Chain[] = [
  {
    id: "polygon",
    name: "Polygon",
    addressKind: "evm",
    evmChainId: 137,
    available: true,
    tokens: [
      { asset: "USDC", contract: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
      { asset: "USDT", contract: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    ],
    explorerTx: (h) => `https://polygonscan.com/tx/${h}`,
    // USDT is confirmed. USDC on Polygon is still to be checked in Nimiq Pay (the $1 test).
    nimiqPayShows: ["USDT"],
  },
  {
    id: "ethereum",
    name: "Ethereum",
    addressKind: "evm",
    evmChainId: 1,
    available: true,
    tokens: [
      { asset: "USDC", contract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { asset: "USDT", contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    ],
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    nimiqPayShows: [],
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    addressKind: "evm",
    evmChainId: 42161,
    available: true,
    tokens: [
      { asset: "USDC", contract: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { asset: "USDT", contract: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    ],
    explorerTx: (h) => `https://arbiscan.io/tx/${h}`,
    nimiqPayShows: [],
  },
  soon("base", "Base", "evm", 8453, (h) => `https://basescan.org/tx/${h}`),
  soon("optimism", "Optimism", "evm", 10, (h) => `https://optimistic.etherscan.io/tx/${h}`),
  soon("solana", "Solana", "solana", null, (h) => `https://solscan.io/tx/${h}`),
  soon("tron", "Tron", "tron", null, (h) => `https://tronscan.org/#/transaction/${h}`),
  soon("bnb", "BNB Chain", "evm", 56, (h) => `https://bscscan.com/tx/${h}`),
  soon("avalanche", "Avalanche", "evm", 43114, (h) => `https://snowtrace.io/tx/${h}`),
];

/** A chain shown as "Soon": no tokens until a provider covers it. */
function soon(id: ChainId, name: string, addressKind: AddressKind, evmChainId: number | null, explorerTx: (h: string) => string): Chain {
  return { id, name, addressKind, evmChainId, available: false, tokens: [], explorerTx, nimiqPayShows: [] };
}

export const CHAIN_IDS = CHAINS.map((c) => c.id) as [ChainId, ...ChainId[]];
export const ASSETS = ["USDC", "USDT"] as const satisfies readonly Asset[];
export const PAY_WITH = ["NIM", "USDT"] as const satisfies readonly PayWith[];

export function getChain(id: string): Chain | undefined {
  return CHAINS.find((c) => c.id === id);
}

/**
 * The tokens a user can receive on `chain` when paying with `payWith`. Empty for chains that are
 * not live. USDT on Polygon is left out when paying with USDT: that is where the user's USDT already is.
 */
export function tokensFor(chain: Chain, payWith: PayWith): Token[] {
  if (!chain.available) return [];
  return chain.tokens.filter((t) => !(payWith === "USDT" && chain.id === "polygon" && t.asset === "USDT"));
}

/** The token, if this (chain, asset) pair can be withdrawn to when paying with `payWith`. */
export function findRoute(chainId: string, asset: string, payWith: PayWith): { chain: Chain; token: Token } | null {
  const chain = getChain(chainId);
  const token = chain && tokensFor(chain, payWith).find((t) => t.asset === asset);
  return chain && token ? { chain, token } : null;
}

/** Whether "Use my Nimiq Pay address" should be offered for this pair. */
export function offerNimiqPayAddress(chain: Chain, asset: Asset): boolean {
  return chain.addressKind === "evm" && chain.nimiqPayShows.includes(asset);
}
