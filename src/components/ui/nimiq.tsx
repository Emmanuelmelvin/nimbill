"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { openInNimiqPayLink } from "@/lib/client/nimiq";
import { AnchorButton, Button, type ButtonSize, type ButtonVariant } from "./button";
import { Card } from "./card";
import { TextLink } from "./navigation";

const noopSubscribe = () => () => {};
/** window.location.href on the client, "" during server render (no hydration mismatch). */
export function useHref(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.href, () => "");
}
export function useCanShare(): boolean {
  return useSyncExternalStore(noopSubscribe, () => "share" in navigator, () => false);
}
export function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
}

/** Shown when a wallet action is needed but the page is open in a normal browser. */
export function OpenInNimiqPay({ text = "This needs the Nimiq Pay wallet." }: { text?: string }) {
  const url = useHref();
  return (
    <Card as="div" tone="strong" padding="sm">
      <p className="text-sm">{text}</p>
      <AnchorButton href={url ? openInNimiqPayLink(url) : "#"} block className="mt-3">
        Open in Nimiq Pay
      </AnchorButton>
      <p className="mt-2 text-center text-xs text-muted">
        Don&apos;t have it?{" "}
        <TextLink href="https://nimiq.com/nimiq-pay" external muted>
          Get Nimiq Pay
        </TextLink>
      </p>
    </Card>
  );
}

export function Countdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const [left, setLeft] = useState(() => Math.max(0, Date.parse(until) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const l = Math.max(0, Date.parse(until) - Date.now());
      setLeft(l);
      if (l === 0) {
        clearInterval(t);
        onExpire?.();
      }
    }, 500);
    return () => clearInterval(t);
  }, [until, onExpire]);
  const s = Math.ceil(left / 1000);
  return (
    <span className="font-mono tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  variant = "secondary",
  size = "md",
  block,
  className,
}: {
  text: string;
  label?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant={variant}
      size={size}
      block={block}
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "Copied ✓" : label}
    </Button>
  );
}
