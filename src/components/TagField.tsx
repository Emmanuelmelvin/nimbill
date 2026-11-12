"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { TAG_DOMAIN, TAG_MAX, formatTag, normalizeTag, tagProblem } from "@/lib/tags";
import { Label, cx } from "./ui";

export type TagStatus = "empty" | "checking" | "ok" | "bad";

/**
 * Whether what was typed can be used as the merchant's tag: shape rules are checked right away,
 * whether it's free is asked from the server a moment after typing stops.
 */
export function useTagStatus(value: string, current: string | null | undefined) {
  const tag = normalizeTag(value);
  const local = tag ? tagProblem(tag) : null;
  const needsServer = !!tag && !local && tag !== current;
  const [answer, setAnswer] = useState<{ tag: string; available: boolean; message: string | null } | null>(null);

  useEffect(() => {
    if (!needsServer) return;
    const t = setTimeout(() => {
      api<{ tag: string; available: boolean; message: string | null }>(`/api/tags/check?tag=${encodeURIComponent(tag)}`)
        .then(setAnswer)
        .catch(() => setAnswer({ tag, available: false, message: "Couldn't check that tag. Try again." }));
    }, 350);
    return () => clearTimeout(t);
  }, [tag, needsServer]);

  let status: TagStatus;
  let message: string | null = null;
  if (!tag) status = "empty";
  else if (local) [status, message] = ["bad", local];
  else if (tag === current) [status, message] = ["ok", `${formatTag(tag)} is yours.`];
  else if (answer?.tag !== tag) status = "checking";
  else if (answer.available) [status, message] = ["ok", `${formatTag(tag)} is free.`];
  else [status, message] = ["bad", answer.message];
  return { tag, status, message };
}

/** Text field for a tag, with "@nimbill" shown after it and a live "free / taken" line under it. */
export function TagField({
  value,
  onChange,
  status,
  message,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  status: TagStatus;
  message: string | null;
  hint?: string;
}) {
  return (
    <div id="tag" className="scroll-mt-24">
      <Label htmlFor="tag-input">Your NimBill tag</Label>
      <div
        className={cx(
          "flex min-h-12 items-center border bg-paper transition-colors focus-within:border-ink focus-within:shadow-[inset_0_0_0_1px_var(--color-ink)] hover:border-ink",
          status === "bad" ? "border-ink" : "border-edge",
        )}
      >
        <span aria-hidden className="pl-4 font-mono text-sm text-muted">
          @
        </span>
        <input
          id="tag-input"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, "").toLowerCase())}
          placeholder="ada_studio"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={TAG_MAX + TAG_DOMAIN.length + 2}
          aria-describedby="tag-status"
          aria-invalid={status === "bad" || undefined}
          className="min-w-0 flex-1 bg-transparent py-2 pl-0.5 font-mono text-sm outline-none"
        />
        <span aria-hidden className="pr-4 font-mono text-sm text-muted">
          @{TAG_DOMAIN}
        </span>
      </div>
      <p id="tag-status" aria-live="polite" className="mt-1.5 flex min-h-4 items-center gap-1.5 text-xs">
        {status === "checking" && <span className="text-muted">Checking…</span>}
        {status === "ok" && <span className="font-medium">✓ {message}</span>}
        {status === "bad" && <span className="font-medium">✕ {message}</span>}
        {status === "empty" && <span className="text-muted">{hint}</span>}
      </p>
      {status !== "empty" && hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
