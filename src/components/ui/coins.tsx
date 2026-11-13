import { Children, Fragment, cloneElement, isValidElement, type ReactNode } from "react";
import { CoinIcon } from "../CoinIcon";
import { formatAsset } from "@/lib/currencies";

// Every "NIM" or "USDT" the app shows gets its coin's logo in front, so the coins read at a glance.
// An amount keeps its logo before the number ("[logo] 92,500 NIM"), on one line. Fiat stays plain.
//
// Matches the coin as a whole word (so NIMBILL_MAX_NIM, NimBill or "NMN-" never match), with an
// optional number right before it: "92,500.00 NIM", "0.009999 USDT", "1.5 NIM".
const COIN = /(\d[\d,]*(?:\.\d+)?\s)?\b(NIM|USDT)\b/g;

/** `text` with a logo before each coin mention. Returns the string itself when there is none. */
export function coinText(text: string): ReactNode {
  COIN.lastIndex = 0;
  if (!COIN.test(text)) return text;
  COIN.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(COIN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const coin = m[2] as "NIM" | "USDT";
    out.push(
      // data-coin marks a mention that already has its logo, so nested helpers never add a second one.
      <span key={at} data-coin="" className="whitespace-nowrap">
        <CoinIcon coin={coin} inline />
        {m[1] ?? ""}
        {coin}
      </span>,
    );
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * Adds coin logos to the plain text in `node`: a string, or the strings among a list of children
 * (as in `Send {amount} NIM`). Elements are left as they are, so code, inputs and anything that
 * already has a logo are never touched.
 */
export function withCoins(node: ReactNode): ReactNode {
  if (typeof node === "string") return coinText(node);
  if (Array.isArray(node)) {
    // Join neighbouring text first: JSX splits `Staked {n} NIM` into "Staked ", n, " NIM".
    const parts: ReactNode[] = [];
    for (const child of Children.toArray(node)) {
      const prev = parts[parts.length - 1];
      const text = typeof child === "number" ? String(child) : child;
      if (typeof text === "string" && typeof prev === "string") parts[parts.length - 1] = prev + text;
      else parts.push(text);
    }
    return parts.map((p, i) => {
      if (typeof p === "string") return <Fragment key={`t${i}`}>{coinText(p)}</Fragment>;
      // A fragment is just more text (`{x && <> also locks {n} NIM</>}`): look inside it too.
      if (isValidElement(p) && p.type === Fragment) {
        return <Fragment key={p.key ?? `f${i}`}>{withCoins((p.props as { children?: ReactNode }).children)}</Fragment>;
      }
      return p;
    });
  }
  if (isValidElement(node) && node.type === Fragment) {
    const props = node.props as { children?: ReactNode };
    return <>{withCoins(props.children)}</>;
  }
  return node;
}

/** Mark a component whose children must stay exactly as written (code samples): `Code.noCoins = true`. */
export type NoCoins = { noCoins?: boolean };

/**
 * Like withCoins, but also walks into nested elements (lists, paragraphs, links), for long pages
 * of prose like /docs. Never enters code: <pre>, <code>, or a component marked `noCoins`.
 */
export function withCoinsDeep(node: ReactNode): ReactNode {
  const walked = Children.map(node, (child): ReactNode => {
    if (!isValidElement(child)) return child;
    if (child.type === "pre" || child.type === "code" || (child.type as NoCoins).noCoins) return child;
    const props = child.props as { children?: ReactNode; "data-coin"?: string };
    if (props["data-coin"] !== undefined) return child; // already has its logo
    if (props.children === undefined || typeof props.children === "function") return child;
    return cloneElement(child, undefined, withCoinsDeep(props.children));
  });
  // Text first, so `Send {n} NIM` still gets one logo before the number.
  return withCoins(walked ?? node);
}

/** Text with coin logos, for paragraphs and spans: <CoinText>Sent as NIM.</CoinText> */
export function CoinText({ children }: { children: ReactNode }) {
  return <>{withCoins(children)}</>;
}

/** A coin amount with its logo: [logo] 92,500.00 NIM. */
export function CoinAmount({ units, asset }: { units: string | number | bigint; asset: "NIM" | "USDT" }) {
  return <>{coinText(formatAsset(units, asset))}</>;
}
