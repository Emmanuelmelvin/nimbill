// NimBill tags: a short public handle such as "chidi@nimbill", used instead of a wallet address
// to send money and (later) as the address of a merchant's public pay page.
// Shared by the server and the browser, so both check the same rules with the same messages.
import { z } from "zod";

export const TAG_DOMAIN = "nimbill";
export const TAG_MIN = 3;
export const TAG_MAX = 20;
/** How long after a change before the tag can be changed again. */
export const TAG_CHANGE_COOLDOWN_DAYS = 30;
/** How long a given-up tag stays blocked for everyone except its previous owner. */
export const TAG_HOLD_DAYS = 90;

// Words that would let someone pose as NimBill or Nimiq, or that are likely URL paths.
const RESERVED = new Set([
  "admin",
  "administrator",
  "api",
  "app",
  "board",
  "billing",
  "cheque",
  "check",
  "help",
  "info",
  "invoice",
  "invoices",
  "mod",
  "moderator",
  "new",
  "nimbill",
  "nimiq",
  "nimiqpay",
  "official",
  "pay",
  "payments",
  "root",
  "security",
  "send",
  "settings",
  "staff",
  "stats",
  "support",
  "system",
  "team",
  "verify",
  "wallet",
  "withdraw",
]);

/**
 * What the person typed, reduced to the bare tag: trimmed, lower-cased, with a leading "@" and a
 * trailing "@nimbill" removed. "@Chidi@NimBill " -> "chidi". It is not checked here.
 */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(new RegExp(`@${TAG_DOMAIN}$`), "");
}

/** Why this (already normalized) tag can't be used, or null if its shape is fine. */
export function tagProblem(tag: string): string | null {
  if (tag.length < TAG_MIN) return `A tag needs at least ${TAG_MIN} characters.`;
  if (tag.length > TAG_MAX) return `A tag can have at most ${TAG_MAX} characters.`;
  if (!/^[a-z0-9_]+$/.test(tag)) return "Use only letters, numbers and _ in a tag.";
  if (!/^[a-z]/.test(tag)) return "A tag has to start with a letter.";
  if (/__/.test(tag) || tag.endsWith("_")) return "A tag can't end with _ or have two _ in a row.";
  if (RESERVED.has(tag) || RESERVED.has(tag.replace(/_/g, ""))) return "That tag is reserved. Try another.";
  return null;
}

/** "chidi" -> "chidi@nimbill". */
export function formatTag(tag: string): string {
  return `${tag}@${TAG_DOMAIN}`;
}

/** A starting suggestion made from the person's name: "Ada Studio" -> "ada_studio". May still be taken. */
export function suggestTag(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, TAG_MAX)
    .replace(/_+$/, "");
  return base.length >= TAG_MIN ? base : "";
}

/** A tag in a request: accepts "@Chidi@nimbill" style input and checks the shape. */
export const TagInput = z
  .string()
  .max(60, "That tag is too long.")
  .transform(normalizeTag)
  .superRefine((tag, ctx) => {
    const problem = tagProblem(tag);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });
