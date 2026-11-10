import { addressFromPublicKey, normalizeAddress } from "../src/lib/nimiq-address.ts";
const proof = "00ef5ac7e9a5af96478d3c492abb2bc55ecf3196fa17d3813d9337c4c457250f0f006af74e66996c3e09f45444f4c8a403a6119a11c64d8752cf390115e738a547fb35ec42253fb151e46bd2715186d86ee13c3da6070ffafb0af1134927777cc00c";
const pk = Uint8Array.from(Buffer.from(proof.slice(2, 66), "hex"));
console.log(addressFromPublicKey(pk), "expected NQ49 N8MB XYCR XBUP 404C KXKK L49M A7BT F082");
console.log(normalizeAddress("nq49n8mbxycrxbup404ckxkkl49ma7btf082"), normalizeAddress("NQ48 N8MB XYCR XBUP 404C KXKK L49M A7BT F082"));
