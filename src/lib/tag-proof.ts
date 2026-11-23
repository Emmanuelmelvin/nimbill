// Signed tags. When someone sets their tag, their wallet signs one fixed sentence:
//
//   NimBill tag
//   chidi@nimbill belongs to NQ42 XXXX XXXX XXXX XXXX XXXX XXXX XXXX XXXX
//
// The sentence is rebuilt from the tag and address a lookup returns, then checked against the
// signature and the public key (which must be the key of that same address). So an address that
// was changed in NimBill's database, or by anyone between NimBill and the wallet, doesn't match
// and nobody pays it. Shared by the server, the browser and anyone else who resolves tags
// (see /docs/tags).
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { z } from "zod";
import { addressFromPublicKey, normalizeAddress } from "./nimiq-address";
import { formatTag, normalizeTag } from "./tags";

/** The owner's public key and their signature of tagProofMessage, both hex. */
export type TagProof = { publicKey: string; signature: string };

export const TagProofInput = z.object({
  publicKey: z.string().regex(/^[0-9a-f]{64}$/i, "That public key isn't valid."),
  signature: z.string().regex(/^[0-9a-f]{128}$/i, "That signature isn't valid."),
});

/** The exact sentence the owner signs. Tag and address are put in their standard form first. */
export function tagProofMessage(tag: string, address: string): string {
  return `NimBill tag\n${formatTag(normalizeTag(tag))} belongs to ${normalizeAddress(address) ?? address}`;
}

/** Nimiq signed-message scheme: ed25519 over sha256("\x16Nimiq Signed Message:\n" + byte length + message). */
export function verifyNimiqSignedMessage(message: string, publicKeyHex: string, signatureHex: string): boolean {
  try {
    const bytes = utf8ToBytes(message);
    const data = utf8ToBytes(`\x16Nimiq Signed Message:\n${bytes.length}${message}`);
    return ed25519.verify(hexToBytes(signatureHex), sha256(data), hexToBytes(publicKeyHex));
  } catch {
    return false;
  }
}

/** Whether the owner of `address` signed that `tag` is theirs. False for a missing proof. */
export function checkTagProof(tag: string, address: string, proof: TagProof | null | undefined): boolean {
  if (!proof || !TagProofInput.safeParse(proof).success) return false;
  const wallet = normalizeAddress(address);
  if (!wallet) return false;
  if (addressFromPublicKey(hexToBytes(proof.publicKey)) !== wallet) return false;
  return verifyNimiqSignedMessage(tagProofMessage(tag, wallet), proof.publicKey, proof.signature);
}
