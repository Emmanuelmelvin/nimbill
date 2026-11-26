"use client";
import { useEffect, useState } from "react";
import { PayinCoinIcon } from "@/components/PayFromOtherChain";
import { Eyebrow, cx } from "@/components/ui";
import { ChainLogo, TokenLogo } from "@/components/withdraw/logos";
import { useReducedMotion } from "@/lib/client/motion";
import { PAYIN_SOURCES, getPayinSource, type PayinSource } from "@/lib/payin/sources";

// Flagship routes featured in the interactive landing-page route visualizer.
const FEATURED: { id: string; sampleSend: string }[] = [
  { id: "tron-usdt", sampleSend: "150.8 USDT" },
  { id: "bitcoin-btc", sampleSend: "0.00168 BTC" },
  { id: "base-usdc", sampleSend: "150.8 USDC" },
  { id: "ethereum-eth", sampleSend: "0.0482 ETH" },
  { id: "solana-sol", sampleSend: "0.7812 SOL" },
  { id: "bnb-usdt", sampleSend: "150.8 USDT" },
  { id: "arbitrum-usdc", sampleSend: "150.8 USDC" },
  { id: "dogecoin-doge", sampleSend: "412.5 DOGE" },
];

const FEATURED_ROUTES = FEATURED.map((f) => ({
  source: getPayinSource(f.id)!,
  sampleSend: f.sampleSend,
}));

/**
 * Interactive, animated cross-chain payment preview for the landing page.
 * Cycles smoothly across supported tokens & chains (or lets the visitor pick any route)
 * to show how any wallet's deposit lands as exact USDT on Polygon in Nimiq Pay.
 */
export function AnyChainVisualizer() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % FEATURED_ROUTES.length), 3200);
    return () => clearInterval(t);
  }, [reduced, paused]);

  const active = FEATURED_ROUTES[index];
  const s = active.source;

  return (
    <div className="border border-ink bg-paper" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Card header */}
      <div className="flex items-center justify-between gap-3 border-b border-ink px-4 py-3">
        <div>
          <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Cross-chain settlement</p>
          <p className="font-mono text-sm font-semibold">Any wallet → Nimiq Pay</p>
        </div>
        <span className="inline-flex items-center gap-1.5 border border-ink px-2 py-0.5 font-mono text-[11px] font-semibold">
          <span aria-hidden className="blink h-1.5 w-1.5 bg-ink" />
          EXACT AMOUNT
        </span>
      </div>

      {/* Animated route bridge */}
      <div className="grid items-center gap-4 px-4 py-6 sm:grid-cols-[1fr_auto_1fr] sm:px-5">
        {/* Source coin */}
        <div key={s.id} className="route-swap flex items-center gap-3 border border-line bg-subtle p-3">
          <PayinCoinIcon source={s} size="lg" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Client sends</p>
            <p className="truncate font-mono text-sm font-bold tabular-nums">{active.sampleSend}</p>
            <p className="truncate text-xs text-muted">on {s.chain}</p>
          </div>
        </div>

        {/* Flowing rail */}
        <div className="flex flex-col items-center justify-center px-1" aria-hidden>
          <span className="font-mono text-[10px] tracking-wider text-muted uppercase">Swapped</span>
          <div className="relative my-2 h-1.5 w-24 overflow-hidden bg-line sm:w-20">
            <span className="packet-flow absolute inset-y-0 left-0 w-6 bg-ink" />
          </div>
          <span className="font-mono text-[10px] text-muted">non-custodial</span>
        </div>

        {/* Destination: always USDT on Polygon */}
        <div className="flex items-center gap-3 border border-ink bg-ink p-3 text-paper">
          <span aria-hidden className="relative inline-flex h-10 w-10 shrink-0">
            <TokenLogo asset="USDT" className="h-full w-full" />
            <span className="absolute -right-1 -bottom-1 flex h-5 w-5 rounded-full bg-paper p-px">
              <ChainLogo chain="polygon" className="h-full w-full" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-wider text-paper/65 uppercase">You receive</p>
            <p className="truncate font-mono text-sm font-bold tabular-nums">150.00 USDT</p>
            <p className="truncate text-xs text-paper/75">on Polygon · verified</p>
          </div>
        </div>
      </div>

      {/* Interactive route selector */}
      <div className="border-t border-line px-4 py-3.5 sm:px-5">
        <Eyebrow>Try a route</Eyebrow>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {FEATURED_ROUTES.map((r, i) => {
            const selected = i === index;
            return (
              <button
                key={r.source.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setIndex(i);
                  setPaused(true);
                }}
                className={cx(
                  "flex items-center gap-2 border px-2 py-1.5 text-left transition-colors",
                  selected ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:border-ink hover:bg-subtle",
                )}
              >
                <PayinCoinIcon source={r.source} />
                <span className="min-w-0 leading-tight">
                  <span className="block font-mono text-[11px] font-bold">{r.source.asset}</span>
                  <span className={cx("block truncate text-[10px]", selected ? "text-paper/75" : "text-muted")}>{r.source.chain}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active route safety metadata */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink bg-subtle px-4 py-2.5 font-mono text-[11px] text-muted sm:px-5">
        <span>
          {s.slippageBps / 100}% buffer · {s.depositWindowMin} min window
        </span>
        <span>Unused buffer refunded automatically</span>
      </div>
    </div>
  );
}

function CoinChip({ source }: { source: PayinSource }) {
  return (
    <li className="flex shrink-0 items-center gap-2.5 border border-line bg-paper px-3 py-2">
      <PayinCoinIcon source={source} />
      <span className="font-mono text-xs font-semibold whitespace-nowrap">{source.asset}</span>
      <span className="text-xs whitespace-nowrap text-muted">{source.chain}</span>
    </li>
  );
}

/** Smooth continuous ticker displaying all 22 supported token/chain combinations. */
export function SupportedCoinsMarquee() {
  const row = (hidden?: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 gap-2.5 pr-2.5">
      {PAYIN_SOURCES.map((s) => (
        <CoinChip key={s.id} source={s} />
      ))}
    </ul>
  );
  return (
    <div
      aria-label={`${PAYIN_SOURCES.length} supported coins and chains`}
      className="mt-10 overflow-hidden border-y border-line bg-subtle py-3"
    >
      <div className="marquee-coins flex w-max">
        {row()}
        {row(true)}
      </div>
    </div>
  );
}
