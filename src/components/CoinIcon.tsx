import { useId } from "react";
// Not "./ui": the UI kit itself shows coin logos (ui/coins.tsx), so importing its index would be circular.
import { cx } from "./ui/cx";

/**
 * The NIM (Nimiq's gold hexagon) and USDT (Tether's teal "T") logos, inline so they need no
 * files or network. By default sized like the currency flags (a 3:2 box) so they line up in the
 * same lists; `className` replaces that size (e.g. "h-6 w-6"). `inline` makes it sit in a line of
 * text at the text's own size, as in "Sent as [logo] NIM".
 */
export function CoinIcon({ coin, className, inline }: { coin: "NIM" | "USDT"; className?: string; inline?: boolean }) {
  // Each NIM logo needs its own gradient id: two on one page would otherwise share (and lose) it.
  const gradient = useId();
  const size = inline ? "mr-[0.25em] h-[0.95em] w-[0.95em] align-[-0.12em]" : "h-4 w-6";
  return (
    <span aria-hidden className={cx(inline ? "inline-flex" : "flex", "shrink-0 items-center justify-center", className ?? size)}>
      {coin === "NIM" ? (
        <svg viewBox="0 0 27 24" className="h-full w-auto">
          <defs>
            <radialGradient
              id={gradient}
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(20.25 21) rotate(180) scale(27)"
            >
              <stop stopColor="#EC991C" />
              <stop offset="1" stopColor="#E9B213" />
            </radialGradient>
          </defs>
          <path
            fill={`url(#${gradient})`}
            d="M26.6991 10.875L21.0741 1.125C20.6691 0.4275 19.9266 0 19.1241 0H7.87414C7.07164 0 6.32914 0.4275 5.92789 1.125L0.302891 10.875C-0.0983594 11.5725 -0.0983594 12.4275 0.302891 13.125L5.92789 22.875C6.32914 23.5725 7.07164 24 7.87414 24H19.1241C19.9266 24 20.6691 23.5725 21.0704 22.875L26.6954 13.125C27.1004 12.4275 27.1004 11.5725 26.6991 10.875Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 32 32" className="h-full w-auto">
          <circle cx="16" cy="16" r="16" fill="#26A17B" />
          <path
            fill="#fff"
            d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"
          />
        </svg>
      )}
    </span>
  );
}
