// Dev helper: produce a signed sign-in payload for a fixed test key (simulates Nimiq Pay's sign()).
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
const B = process.argv[2] || "http://localhost:3000";
const sk = sha256(utf8ToBytes("nimbill-dev-test-key"));
const { message } = await (await fetch(B + "/api/auth/challenge")).json();
const signature = bytesToHex(ed25519.sign(sha256(utf8ToBytes(`\x16Nimiq Signed Message:\n${message.length}${message}`)), sk));
console.log(JSON.stringify({ message, publicKey: bytesToHex(ed25519.getPublicKey(sk)), signature }));
