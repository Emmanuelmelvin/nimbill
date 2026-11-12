"use client";
import { useEffect, useState } from "react";
import { LogoMark, cx } from "@/components/ui";
import { useReducedMotion } from "@/lib/client/motion";

const ITEMS = [
  { name: "Logo design", qty: "1 × 120,000", amount: "₦120,000" },
  { name: "Brand guidelines", qty: "1 × 45,000", amount: "₦45,000" },
  { name: "Social media kit", qty: "2 × 10,000", amount: "₦20,000" },
];

// How long each step stays on screen, in ms. 0: empty invoice, 1–3: line items appear,
// 4: total and rate-locked quote, 5: sending, 6: checking the chain, 7: paid. Then it starts over.
const STEP_MS = [900, 650, 650, 900, 1600, 1500, 1400, 3800];
const PAID = STEP_MS.length - 1;
const STAGES = ["Quote", "Send", "Verify", "Paid"];
const STATUS = [
  "Waiting for payment",
  "Waiting for payment",
  "Waiting for payment",
  "Waiting for payment",
  "Rate locked for 5 minutes",
  "Sending from the client's wallet…",
  "Checking the blockchain…",
  "Paid · verified on-chain",
];
const TIMER = ["5:00", "5:00", "5:00", "5:00", "4:59", "4:58", "4:57", "4:57"];

/** The hero's moving picture: an invoice fills in, gets paid and is stamped, on a loop. */
export function ReceiptDemo() {
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setStep((s) => (s >= PAID ? 0 : s + 1)), STEP_MS[step]);
    return () => clearTimeout(t);
  }, [step, reduced]);

  const s = reduced ? PAID : step;
  const filled = s >= 4 ? s - 3 : 0; // how many of the four stages are done
  const working = s === 5 || s === 6;

  return (
    <div
      className="float relative mx-auto w-full max-w-sm"
      role="img"
      aria-label="An example invoice for 185,000 Naira being paid in NIM and verified on the blockchain"
    >
      {/* The sheet underneath, for a stacked-paper look. */}
      <div aria-hidden className="absolute inset-0 translate-x-3 translate-y-3 border border-ink bg-subtle" />

      <div aria-hidden className="relative">
        <div className="border border-b-0 border-ink bg-paper p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LogoMark size={22} />
              <span className="font-bold tracking-tighter">NimBill</span>
            </div>
            <span className="border border-line px-1.5 font-mono text-[10px] tracking-wider text-muted">EXAMPLE · INV-0042</span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase">From</p>
              <p className="mt-0.5 font-semibold">Chidi Okeke</p>
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Billed to</p>
              <p className="mt-0.5 font-semibold">Tunde Bello</p>
            </div>
          </div>

          <ul className="mt-4 border-t border-line">
            {ITEMS.map((item, i) => (
              <li
                key={item.name}
                data-on={s >= i + 1 || undefined}
                className="pop-row flex items-baseline justify-between gap-3 border-b border-line py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.name}</span>
                  <span className="font-mono text-[10px] text-muted">{item.qty}</span>
                </span>
                <span className="font-mono text-sm tabular-nums">{item.amount}</span>
              </li>
            ))}
          </ul>

          <div data-on={s >= 4 || undefined} className="pop-row mt-3 flex items-baseline justify-between">
            <span className="font-mono text-[11px] tracking-wider text-muted uppercase">Total</span>
            <span className="text-2xl font-bold tabular-nums">₦185,000</span>
          </div>

          <div
            data-on={s >= 4 || undefined}
            className="pop-row mt-3 flex items-center justify-between border border-ink bg-subtle px-3 py-2"
          >
            <div>
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Client pays</p>
              <p className="font-mono text-sm font-semibold tabular-nums">92,500.00 NIM</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase">Rate lock</p>
              <p className="font-mono text-sm font-semibold tabular-nums">{TIMER[s]}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-1">
            {STAGES.map((stage, i) => (
              <div key={stage}>
                <div className="h-1.5 bg-line">
                  <div
                    className={cx("h-full origin-left bg-ink transition-transform duration-500", i < filled ? "scale-x-100" : "scale-x-0")}
                  />
                </div>
                <p className={cx("mt-1 font-mono text-[10px] tracking-wider uppercase", i < filled ? "text-ink" : "text-muted")}>{stage}</p>
              </div>
            ))}
          </div>

          <p className="mt-3 flex items-center gap-2 font-mono text-[11px]">
            <span className={cx("h-2 w-2 shrink-0", s === PAID ? "bg-ink" : "border border-ink", working && "blink bg-ink")} />
            {STATUS[s]}
          </p>
        </div>

        <Zigzag />

        {s === PAID && (
          <div className="stamp pointer-events-none absolute top-[38%] left-1/2 border-[3px] border-ink bg-paper px-4 py-1.5 text-center">
            <p className="font-mono text-3xl leading-none font-black tracking-[0.2em]">PAID</p>
            <p className="mt-1 font-mono text-[9px] tracking-widest">VERIFIED ON-CHAIN</p>
          </div>
        )}
      </div>

      {s === PAID && (
        <>
          <span
            aria-hidden
            className="chip-pop absolute -top-4 -right-2 border border-ink bg-ink px-2 py-1 font-mono text-xs font-semibold text-paper sm:-right-8"
          >
            +₦185,000
          </span>
          <span
            aria-hidden
            className="chip-pop absolute bottom-16 -left-3 border border-ink bg-paper px-2 py-1 font-mono text-[11px] sm:-left-10"
            style={{ animationDelay: "150ms" }}
          >
            ✓ in block #4,812,337
          </span>
        </>
      )}
    </div>
  );
}

/** The torn bottom edge of the receipt, same as the logo's. */
function Zigzag() {
  const teeth = 22;
  let d = "M0 0";
  for (let i = 0; i < teeth; i++) {
    const x = (i * 100) / teeth;
    d += ` L${(x + 50 / teeth).toFixed(3)} 7 L${(x + 100 / teeth).toFixed(3)} 0`;
  }
  return (
    <svg viewBox="0 0 100 7" preserveAspectRatio="none" className="-mt-px block h-3 w-full" aria-hidden>
      <path d={`${d} Z`} className="fill-paper" />
      <path d={d} fill="none" className="stroke-ink" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
