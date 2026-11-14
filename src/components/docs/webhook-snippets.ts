// Copy-paste code for "Pay with NimBill" (the /docs/webhooks pages). Tab labels match the other
// code groups ("JavaScript", "Python"), so a reader's language choice carries over.
// Every sample does the same thing; keep them in step when one changes.
import type { CodeTab } from "./snippets";

/** Create a signed invoice from the store's server and send the customer to pay it. */
export function createInvoiceTabs(base: string): CodeTab[] {
  return [
    {
      label: "JavaScript",
      code: `import { createHmac } from "node:crypto";

const NIMBILL = "${base}";
const TAG = "ada"; // your tag, without @nimbill
const SECRET = process.env.NIMBILL_WEBHOOK_SECRET; // "whsec_…", from Settings → Webhooks

export async function startNimbillPayment(order) {
  const body = JSON.stringify({
    payerName: order.customerName,
    amount: order.total, // 25
    currency: order.currency, // "USD"
    description: \`Order \${order.id}\`,
    reference: order.id,
    metadata: { cart: order.cartId },
    returnUrl: \`https://shop.example.com/orders/\${order.id}\`,
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(\`\${t}.\${body}\`).digest("hex");

  const res = await fetch(\`\${NIMBILL}/api/pay/\${TAG}/invoices\`, {
    method: "POST",
    headers: { "content-type": "application/json", "nimbill-signature": \`t=\${t},v1=\${v1}\` },
    body, // exactly the string you signed
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error.message);

  await db.orders.update(order.id, { nimbillInvoiceId: json.invoice.id }); // webhooks are matched by this
  return \`\${NIMBILL}/i/\${json.invoice.id}\`; // redirect the customer here
}`,
    },
    {
      label: "Python",
      code: `import hashlib, hmac, json, os, time
import requests

NIMBILL = "${base}"
TAG = "ada"  # your tag, without @nimbill
SECRET = os.environ["NIMBILL_WEBHOOK_SECRET"]  # "whsec_…", from Settings → Webhooks

def start_nimbill_payment(order):
    body = json.dumps({
        "payerName": order["customer_name"],
        "amount": order["total"],        # 25
        "currency": order["currency"],   # "USD"
        "description": f"Order {order['id']}",
        "reference": order["id"],
        "metadata": {"cart": order["cart_id"]},
        "returnUrl": f"https://shop.example.com/orders/{order['id']}",
    })
    t = int(time.time())
    v1 = hmac.new(SECRET.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()

    r = requests.post(
        f"{NIMBILL}/api/pay/{TAG}/invoices",
        data=body.encode(),  # exactly the string you signed
        headers={"content-type": "application/json", "nimbill-signature": f"t={t},v1={v1}"},
    )
    data = r.json()
    if not r.ok:
        raise RuntimeError(data["error"]["message"])

    save_invoice_id(order["id"], data["invoice"]["id"])  # webhooks are matched by this
    return f"{NIMBILL}/i/{data['invoice']['id']}"  # redirect the customer here`,
    },
    {
      label: "PHP",
      code: `<?php
$nimbill = '${base}';
$tag = 'ada'; // your tag, without @nimbill
$secret = getenv('NIMBILL_WEBHOOK_SECRET'); // "whsec_…", from Settings → Webhooks

function start_nimbill_payment(array $order): string {
  global $nimbill, $tag, $secret;
  $body = json_encode([
    'payerName' => $order['customer_name'],
    'amount' => $order['total'],      // 25
    'currency' => $order['currency'], // "USD"
    'description' => "Order {$order['id']}",
    'reference' => $order['id'],
    'metadata' => ['cart' => $order['cart_id']],
    'returnUrl' => "https://shop.example.com/orders/{$order['id']}",
  ]);
  $t = time();
  $v1 = hash_hmac('sha256', "$t.$body", $secret);

  $ch = curl_init("$nimbill/api/pay/$tag/invoices");
  curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $body, // exactly the string you signed
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', "NimBill-Signature: t=$t,v1=$v1"],
  ]);
  $res = json_decode(curl_exec($ch), true);
  if (curl_getinfo($ch, CURLINFO_RESPONSE_CODE) >= 300) throw new Exception($res['error']['message']);

  save_invoice_id($order['id'], $res['invoice']['id']); // webhooks are matched by this
  return "$nimbill/i/{$res['invoice']['id']}"; // redirect the customer here
}`,
    },
  ];
}

/** Receive and verify a webhook. */
export const receiveTabs: CodeTab[] = [
  {
    label: "JavaScript",
    code: `import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.NIMBILL_WEBHOOK_SECRET;

export function verifyNimbill(header = "", rawBody, secret = SECRET) {
  const t = Number(/(?:^|,)t=(\\d+)/.exec(header)?.[1]);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false; // missing or more than 5 minutes off
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest();
  return [...header.matchAll(/v1=([0-9a-f]{64})/g)].some((m) => timingSafeEqual(expected, Buffer.from(m[1], "hex")));
}

const app = express();
// The raw body: the signature covers the exact bytes, so don't parse it first.
app.post("/nimbill/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body.toString("utf8");
  if (!verifyNimbill(req.get("nimbill-signature"), raw)) return res.sendStatus(400);

  const event = JSON.parse(raw);
  if (await db.events.seen(event.id)) return res.sendStatus(200); // a retry you already handled

  if (event.type === "invoice.paid" && !event.test) {
    const invoice = event.data.invoice;
    const order = await db.orders.findByNimbillInvoiceId(invoice.id);
    if (order && Number(invoice.total) === order.total && invoice.currency === order.currency) {
      await db.orders.markPaid(order.id, { txHash: invoice.payment.txHash });
    }
  }
  await db.events.remember(event.id);
  res.sendStatus(200); // answer fast; do slow work afterwards
});`,
  },
  {
    label: "Python",
    code: `import hashlib, hmac, json, os, re, time
from flask import Flask, abort, request

SECRET = os.environ["NIMBILL_WEBHOOK_SECRET"]
app = Flask(__name__)

def verify_nimbill(header, raw_body: bytes, secret=SECRET) -> bool:
    m = re.search(r"(?:^|,)t=(\\d+)", header or "")
    if not m or abs(time.time() - int(m.group(1))) > 300:  # missing or more than 5 minutes off
        return False
    expected = hmac.new(secret.encode(), m.group(1).encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in re.findall(r"v1=([0-9a-f]{64})", header))

@app.post("/nimbill/webhook")
def nimbill_webhook():
    raw = request.get_data()  # the raw body: the signature covers the exact bytes
    if not verify_nimbill(request.headers.get("NimBill-Signature"), raw):
        abort(400)

    event = json.loads(raw)
    if already_handled(event["id"]):  # a retry you already handled
        return "", 200

    if event["type"] == "invoice.paid" and not event["test"]:
        invoice = event["data"]["invoice"]
        order = find_order_by_nimbill_invoice_id(invoice["id"])
        if order and float(invoice["total"]) == order["total"] and invoice["currency"] == order["currency"]:
            mark_order_paid(order["id"], invoice["payment"]["txHash"])

    remember(event["id"])
    return "", 200`,
  },
  {
    label: "PHP",
    code: `<?php
function verify_nimbill(string $header, string $rawBody, string $secret): bool {
  if (!preg_match('/(?:^|,)t=(\\d+)/', $header, $t) || abs(time() - (int) $t[1]) > 300) return false;
  $expected = hash_hmac('sha256', $t[1] . '.' . $rawBody, $secret);
  preg_match_all('/v1=([0-9a-f]{64})/', $header, $sigs);
  foreach ($sigs[1] as $sig) if (hash_equals($expected, $sig)) return true;
  return false;
}

$raw = file_get_contents('php://input'); // the raw body: the signature covers the exact bytes
if (!verify_nimbill($_SERVER['HTTP_NIMBILL_SIGNATURE'] ?? '', $raw, getenv('NIMBILL_WEBHOOK_SECRET'))) {
  http_response_code(400);
  exit;
}

$event = json_decode($raw, true);
if (already_handled($event['id'])) { http_response_code(200); exit; } // a retry you already handled

if ($event['type'] === 'invoice.paid' && !$event['test']) {
  $invoice = $event['data']['invoice'];
  $order = find_order_by_nimbill_invoice_id($invoice['id']);
  if ($order && (float) $invoice['total'] === (float) $order['total'] && $invoice['currency'] === $order['currency']) {
    mark_order_paid($order['id'], $invoice['payment']['txHash']);
  }
}
remember($event['id']);
http_response_code(200);`,
  },
];

/** A full invoice.paid delivery, as a store receives it. */
export function paidPayload(base: string): string {
  return JSON.stringify(
    {
      id: "evt_7kq2m9xw4hd3pn8c",
      type: "invoice.paid",
      createdAt: "2026-11-14T10:42:07.118Z",
      test: false,
      data: {
        invoice: {
          id: "89mwch33sp",
          number: "INV-0042",
          status: "paid",
          reference: "order-1042",
          metadata: { cart: "c_9f2" },
          payerName: "Tunde Bakare",
          productId: null,
          items: [{ description: "Order order-1042", quantity: 1, unitPrice: 25 }],
          currency: "USD",
          total: "25.00",
          url: `${base}/i/89mwch33sp`,
          createdAt: "2026-11-14T10:38:51.402Z",
          payment: {
            asset: "NIM",
            amount: "2512300000",
            rate: "0.00995",
            txHash: "3f9a…e21c",
            from: "NQ12 3456 7890 ABCD EFGH JKLM NPQR STUV",
            paidAt: "2026-11-14T10:41:58.000Z",
            tip: null,
            usd: "25.00",
          },
        },
      },
    },
    null,
    2,
  );
}

export const DELIVERY_HEADERS = `POST /nimbill/webhook HTTP/1.1
Content-Type: application/json
User-Agent: NimBill-Webhooks/1.0
NimBill-Signature: t=1763116927,v1=5f2c8e…
NimBill-Event-Id: evt_7kq2m9xw4hd3pn8c
NimBill-Event-Type: invoice.paid
NimBill-Delivery-Attempt: 1`;
