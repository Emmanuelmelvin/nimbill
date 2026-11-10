// Central clients for every external service the server talks to. Import from here:
//   import { nimiq, polygon, coingecko, validators } from "@/lib/clients";
// Browser-side equivalents: lib/client/api.ts (our API), lib/client/nimiq.ts (Nimiq Pay),
// lib/client/wallet.ts (Polygon wallet).
export { nimiq, decodeData, sameNimAddress, type NimTx, type NimStaker } from "./nimiq";
export { polygon, USDT_POLYGON, type UsdtTransfer, type UsdtTxResult } from "./polygon";
export { coingecko } from "./coingecko";
export { validators, type Validator } from "./validators";
