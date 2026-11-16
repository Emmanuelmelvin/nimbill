import { getAddress, isAddress } from "viem";
import { normalizeAddress } from "../nimiq-address";
import { getChain, type Chain } from "./chains";

// Checks a pasted destination address against the chain the user picked, in the browser (to say
// what is wrong at once) and on the server (the check that counts). Money sent to an address on
// the wrong chain is usually gone, so anything that is not clearly right is refused.

export type AddressCheck = { ok: true; address: string } | { ok: false; message: string };

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** What kind of address this looks like, to say "that is a Tron address" instead of just "invalid". */
function looksLike(input: string): string | null {
  if (/^0x[0-9a-fA-F]{40}$/.test(input)) return "an EVM";
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(input)) return "a Tron";
  if (normalizeAddress(input)) return "a Nimiq";
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(input)) return "a Bitcoin";
  if (BASE58.test(input) && input.length >= 32 && input.length <= 44) return "a Solana";
  return null;
}

export function checkDestination(chainOrId: Chain | string, raw: string): AddressCheck {
  const chain = typeof chainOrId === "string" ? getChain(chainOrId) : chainOrId;
  if (!chain) return { ok: false, message: "Pick a chain first." };
  if (!chain.available) return { ok: false, message: `${chain.name} is not available yet.` };
  const input = raw.trim();
  if (!input) return { ok: false, message: `Paste an address on ${chain.name}.` };

  if (chain.addressKind === "evm") {
    if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
      // Mixed case carries a checksum (EIP-55): a typo in it means the address is wrong.
      if (!isAddress(input, { strict: true })) {
        return { ok: false, message: "This address has a typo (its checksum does not match). Copy it again." };
      }
      const address = getAddress(input);
      if (/^0x0{40}$/i.test(address)) return { ok: false, message: "That is the zero address. Nobody can spend from it." };
      return { ok: true, address };
    }
    const kind = looksLike(input);
    return {
      ok: false,
      message: kind
        ? `That looks like ${kind} address. ${chain.name} addresses start with 0x.`
        : `That is not a ${chain.name} address. It should start with 0x and be 42 characters long.`,
    };
  }

  // Solana and Tron are listed but not live yet, so nothing reaches here today. Their checks
  // (base58, and Tron's checksum) are added when a provider for them is.
  return { ok: false, message: `${chain.name} is not available yet.` };
}
