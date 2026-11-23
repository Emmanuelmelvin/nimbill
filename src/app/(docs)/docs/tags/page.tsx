import type { Metadata } from "next";
import { Callout, Code, DocPage, H2 } from "@/components/docs/DocsParts";

export const metadata: Metadata = {
  title: "Checking a tag",
  description:
    "Resolve a NimBill tag such as ada@nimbill to a Nimiq wallet address, and check the owner's own signature so you don't have to trust NimBill.",
};

const LOOKUP = `GET https://nimbill.app/api/tags/ada

{
  "owner": {
    "tag": "ada",
    "handle": "ada@nimbill",
    "name": "Ada Studio",
    "address": "NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4",
    "acceptsUsdt": true,
    "avatarUrl": "/api/avatars/ada?v=1",
    "proof": {
      "publicKey": "<64 hex characters>",
      "signature": "<128 hex characters>"
    }
  }
}`;

const SENTENCE = `NimBill tag
ada@nimbill belongs to NQ16 ADMA EM3A 32VA BTBJ SA58 B0FV 909J FQE4`;

const CHECK = `// npm install @noble/curves @noble/hashes
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY";

function mod97(s) {
  let r = 0;
  for (const c of s) {
    const digits = /[0-9]/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of digits) r = (r * 10 + Number(d)) % 97;
  }
  return r;
}

/** The Nimiq address ("NQ.. .... ...") of an Ed25519 public key. */
function addressOf(publicKey) {
  const bytes = blake2b(publicKey, { dkLen: 32 }).subarray(0, 20);
  let bits = 0, value = 0, b32 = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) b32 += ALPHABET[(value >>> (bits -= 5)) & 31];
  }
  const check = String(98 - mod97(b32 + "NQ00")).padStart(2, "0");
  return ("NQ" + check + b32).replace(/.{4}/g, "$& ").trim();
}

/** True only if the tag's owner signed that it belongs to this address. */
export function tagIsConfirmed(owner) {
  if (!owner.proof) return false;
  const publicKey = hexToBytes(owner.proof.publicKey);
  // 1. The key must be the key of the address you are about to pay.
  if (addressOf(publicKey) !== owner.address) return false;
  // 2. Rebuild the sentence yourself. Never take it from the response.
  const sentence = \`NimBill tag\\n\${owner.tag}@nimbill belongs to \${owner.address}\`;
  // 3. Nimiq signed message: sha256 of a fixed prefix, the length in bytes, then the sentence.
  const bytes = utf8ToBytes(sentence);
  const data = utf8ToBytes(\`\\x16Nimiq Signed Message:\\n\${bytes.length}\${sentence}\`);
  return ed25519.verify(hexToBytes(owner.proof.signature), sha256(data), publicKey);
}`;

export default function Tags() {
  return (
    <DocPage title="Checking a tag" description="Pay ada@nimbill without having to trust NimBill.">
      <p className="text-muted">
        A tag such as <span className="font-mono text-ink">ada@nimbill</span> is a short name for a Nimiq wallet. Any wallet, app or agent
        can turn it into an address. When the owner sets their tag, their own wallet signs that it belongs to that address, so you can check
        the answer yourself instead of trusting NimBill&apos;s server.
      </p>

      <H2 id="lookup">Look the tag up</H2>
      <p className="text-muted">
        Call the public lookup. It needs no sign-in and works from other websites. Send the tag with or without
        <span className="font-mono text-ink"> @nimbill</span>.
      </p>
      <Code label="Request and response">{LOOKUP}</Code>
      <p className="text-muted">
        <span className="font-mono text-ink">proof</span> is <span className="font-mono text-ink">null</span> when the owner set their tag
        before signing existed and hasn&apos;t confirmed it yet.
      </p>

      <H2 id="sentence">What the owner signs</H2>
      <p className="text-muted">
        Exactly these two lines, with the tag in lower case and the address in groups of four, separated by a single newline:
      </p>
      <Code label="Signed text">{SENTENCE}</Code>
      <p className="text-muted">
        It&apos;s signed the standard Nimiq way, the same as signing in to NimBill. The owner&apos;s wallet signs once, when they choose the
        tag, and again only if they change it.
      </p>

      <H2 id="check">Check it before you pay</H2>
      <p className="text-muted">
        Three checks, all on your side: the public key belongs to the address, the sentence is rebuilt from the tag and address, and the
        signature matches. This is the whole check in JavaScript:
      </p>
      <Code label="tag-check.js">{CHECK}</Code>

      <H2 id="results">What to do with the result</H2>
      <ul className="list-disc space-y-1.5 pl-5 text-muted">
        <li>
          <span className="font-semibold text-ink">Confirmed:</span> the money goes to the wallet that owns the tag. Still show the name and
          get a clear yes, because lookalike tags exist.
        </li>
        <li>
          <span className="font-semibold text-ink">No proof:</span> the owner hasn&apos;t confirmed the tag yet. Ask the person to check the
          name and address with the recipient before sending.
        </li>
        <li>
          <span className="font-semibold text-ink">Proof that fails:</span> don&apos;t send. The address may have been changed after the
          owner signed. Ask the recipient for their wallet address instead.
        </li>
      </ul>

      <Callout type="note" title="What this doesn't cover">
        <p>
          The signature covers the Nimiq address only. The Polygon address used for USDT isn&apos;t signed yet. And if NimBill is down, tags
          can&apos;t be looked up at all, though you can still pay a wallet address directly.
        </p>
      </Callout>
    </DocPage>
  );
}
