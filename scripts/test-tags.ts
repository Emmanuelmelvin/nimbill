// Unit tests for the rules shared by the browser and the server: tags, board requests, cheques, agent docs.
import { agentStepsText, agentUrl } from "../src/lib/agent-docs.ts";
import { ENDPOINTS, openApiSpec, skillMarkdown } from "../src/lib/api-reference.ts";
import {
  chequeNumber,
  clientNonceForTx,
  combinePublicKeys,
  completeDualSignature,
  formatChequeCode,
  hashBasicTxContent,
  isValidChequeSecret,
  keyFromSeedBytes,
  linkKeyFromSecret,
  newChequeSecret,
  parseChequeInput,
  serializeBasicTxContent,
  serverPartialSignTx,
  verifyRawBasicTx,
} from "../src/lib/cheque-crypto.ts";
import { BoardInvoiceBody, ChequeClaimBody, NewChequeBody, NewTransferBody, ProductBody } from "../src/lib/schemas.ts";
import { TagInput, avatarUrl, formatTag, normalizeTag, suggestTag, tagProblem } from "../src/lib/tags.ts";

let failed = 0;
const ok = (c: unknown, m: string) => {
  console.log((c ? "PASS " : "FAIL ") + m);
  if (!c) failed++;
};

// ---- tags ----
ok(normalizeTag("  @Chidi@NimBill ") === "chidi", "normalize strips @, @nimbill, case and spaces");
ok(normalizeTag("ada_studio") === "ada_studio", "normalize leaves a clean tag alone");
ok(formatTag("ada") === "ada@nimbill", "format adds @nimbill");
ok(avatarUrl("ada", 2) === "/api/avatars/ada?v=2", "avatarUrl includes the version");
for (const [t, why] of [
  ["ab", "too short"],
  ["a".repeat(21), "too long"],
  ["1ada", "starts with a digit"],
  ["ada-x", "has a dash"],
  ["ada__x", "double underscore"],
  ["ada_", "ends with _"],
  ["admin", "reserved"],
  ["nim_bill", "reserved once _ is removed"],
] as const) {
  ok(tagProblem(t) !== null, `refuses a tag that is ${why}: ${t}`);
}
for (const t of ["ada", "chidi_okeke", "a1b2c3", "x".repeat(20)]) ok(tagProblem(t) === null, `accepts ${t}`);
ok(suggestTag("Ada Studio") === "ada_studio", "suggests from a name");
ok(suggestTag("Ọlá Àdé") === "ola_ade", "suggestion drops accents");
ok(suggestTag("123 Ltd") === "ltd", "suggestion starts with a letter");
ok(suggestTag("Al") === "", "no suggestion when too short");
ok(suggestTag("The Very Long Business Name Ltd").length <= 20, "suggestion fits the length limit");
ok(TagInput.safeParse("@Ada@nimbill").data === "ada", "TagInput normalizes");
ok(!TagInput.safeParse("support").success, "TagInput refuses reserved tags");

// ---- request bodies ----
ok(BoardInvoiceBody.safeParse({ productId: "p1", payerName: "Tunde" }).success, "board: product purchase is valid");
ok(
  BoardInvoiceBody.safeParse({ amount: 10, currency: "NGN", description: "Deposit", payerName: "Tunde" }).success,
  "board: open amount is valid",
);
ok(!BoardInvoiceBody.safeParse({ amount: 10, currency: "NGN", payerName: "Tunde" }).success, "board: open amount needs a description");
ok(!BoardInvoiceBody.safeParse({ productId: "p1", payerName: "  " }).success, "board: blank name refused");
ok(!BoardInvoiceBody.safeParse({ productId: "p1", payerName: "T", quantity: 101 }).success, "board: quantity capped at 100");
ok(!BoardInvoiceBody.safeParse({ productId: "p1", payerName: "T", quantity: 1.5 }).success, "board: quantity must be whole");
ok(
  NewTransferBody.safeParse({ to: "ada", amount: "2.5", currency: "NIM" }).data?.amount === 2.5,
  "transfer: amount string is read as a number",
);
ok(!NewTransferBody.safeParse({ to: "ada", amount: 1, currency: "USDT" }).success, "transfer: USDT is not a send currency");
ok(!ProductBody.safeParse({ name: "X", price: 1, currency: "NIM" }).success, "product: priced in fiat only");

// ---- agent docs ----
const origin = "https://pay.example";
ok(agentUrl(origin, "/api/pay/{tag}", { tag: "ada" }) === "https://pay.example/api/pay/ada", "agentUrl fills placeholders");
ok(
  agentUrl(origin, "/api/invoices/{invoiceId}") === "https://pay.example/api/invoices/{invoiceId}",
  "agentUrl leaves unknown placeholders",
);
ok(agentStepsText(origin).includes("POST https://pay.example/api/pay/{tag}/invoices"), "steps text has absolute URLs");
const skill = skillMarkdown(origin);
ok(/^---\nname: nimbill-pay\ndescription: .+\n---\n/.test(skill), "skill has name and description frontmatter");
ok(skill.includes("seed phrase"), "skill tells agents never to ask for keys");
const spec = openApiSpec(origin);
ok(Object.values(spec.paths).flatMap((p) => Object.keys(p)).length === ENDPOINTS.length, "OpenAPI has one operation per endpoint");
ok(spec.servers[0].url === origin, "OpenAPI server is the origin");

// ---- cheques: codes, schemas, 2-of-2 Ed25519 Nimiq transactions ----
const sampleSecret = newChequeSecret();
ok(isValidChequeSecret(sampleSecret), "newChequeSecret produces a valid 24-char base32 secret");
const sampleId = "c9f8e7d6c5";
const fullCode = formatChequeCode(sampleId, sampleSecret);
ok(
  fullCode ===
    `${chequeNumber(sampleId)}-${sampleSecret
      .toUpperCase()
      .match(/.{1,6}/g)!
      .join("-")}`,
  "formatChequeCode formats CHQ-ID-SECRET",
);
const parsedCode = parseChequeInput(fullCode);
ok(parsedCode?.id === sampleId && parsedCode?.secret === sampleSecret, "parseChequeInput parses full CHQ code");
const parsedUrl = parseChequeInput(`https://nimbill.app/c/${sampleId}#${sampleSecret}`);
ok(parsedUrl?.id === sampleId && parsedUrl?.secret === sampleSecret, "parseChequeInput parses cheque URL with #secret");
const parsedShort = parseChequeInput(chequeNumber(sampleId));
ok(parsedShort?.id === sampleId && parsedShort?.secret === null, "parseChequeInput parses short CHQ number without secret");

const linkKey = linkKeyFromSecret(sampleSecret);
const serverKey = keyFromSeedBytes("test-server-key:", new Uint8Array([1, 2, 3, 4]));
const chequeWallet = combinePublicKeys(linkKey.publicKey, serverKey.publicKey);
ok(/^NQ\d{2}(\s[0-9A-Z]{4}){8}$/.test(chequeWallet.address), "combinePublicKeys produces a valid Nimiq address");

const txFields = {
  senderPublicKey: chequeWallet.publicKey,
  recipient: "NQ07 0000 0000 0000 0000 0000 0000 0000 0000",
  value: 2500000,
  fee: 0,
  validityStartHeight: 40123456,
};
const txContent = serializeBasicTxContent(txFields);
ok(txContent.length === 67, "serializeBasicTxContent is 67 bytes");
const { noncePublicKey } = clientNonceForTx(sampleSecret, txContent);
const { serverNoncePublicKey, serverPartialSig } = serverPartialSignTx({
  serverScalar: serverKey.scalar,
  chequePublicKey: chequeWallet.publicKey,
  clientNoncePublicKey: noncePublicKey,
  txContent,
});
const signed = completeDualSignature({
  secret: sampleSecret,
  tx: txFields,
  serverNoncePublicKey,
  serverPartialSig,
});
ok(signed.rawTx.length === 278, "completeDualSignature produces a 139-byte (278 hex) raw transaction");
ok(signed.txHash === hashBasicTxContent(txFields), "signed txHash matches Blake2b-256 of content");
const verified = verifyRawBasicTx(signed.rawTx, txFields);
ok(verified.valid && verified.txHash === signed.txHash, "verifyRawBasicTx validates 2-of-2 signed transaction");
ok(
  !verifyRawBasicTx(signed.rawTx, { ...txFields, recipient: chequeWallet.address }).valid,
  "verifyRawBasicTx rejects raw transaction if recipient differs",
);

ok(
  NewChequeBody.safeParse({
    amount: "50",
    currency: "NIM",
    linkPublicKey: linkKey.publicKey,
    recipientTag: "  @Ada@nimbill ",
    note: "Lunch",
  }).data?.recipientTag === "@Ada@nimbill",
  "NewChequeBody trims recipientTag and coerces amount",
);
ok(
  NewChequeBody.safeParse({
    amount: 50,
    currency: "NIM",
    linkPublicKey: linkKey.publicKey,
    recipientTag: null,
  }).success,
  "NewChequeBody accepts free cheque (recipientTag: null)",
);
ok(
  ChequeClaimBody.safeParse({
    step: "prepare",
    action: "cash",
    recipientAddress: chequeWallet.address,
    validityStartHeight: 100,
    clientNoncePublicKey: noncePublicKey,
  }).success,
  "ChequeClaimBody validates prepare step",
);

if (failed) {
  console.log(`\n${failed} failed`);
  process.exitCode = 1;
}
