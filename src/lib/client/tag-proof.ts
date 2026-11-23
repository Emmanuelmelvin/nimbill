"use client";
import { type TagProof, tagProofMessage } from "@/lib/tag-proof";
import { getNimiq } from "./nimiq";

/**
 * Ask the wallet to sign that `tag` belongs to `address`, so people paying the tag can check it
 * themselves. Null when no wallet can be reached (outside Nimiq Pay). Throws like any wallet
 * request, including when the person declines.
 */
export async function signTag(tag: string, address: string): Promise<TagProof | null> {
  const nimiq = await getNimiq().catch(() => null);
  if (!nimiq) return null;
  const { publicKey, signature } = await nimiq.sign(tagProofMessage(tag, address));
  return { publicKey, signature };
}
