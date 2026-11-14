import type { NextRequest } from "next/server";
import { AGENT_RULES, agentStepsText } from "@/lib/agent-docs";
import { requestOrigin } from "@/lib/request-origin";
import { SITE_DESCRIPTION } from "@/lib/site";

// /llms.txt: a plain-text guide for AI agents and other programs (see llmstxt.org).
export function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  const body = `# NimBill

> ${SITE_DESCRIPTION}

Every NimBill user has a tag like ada@nimbill and a public board at ${origin}/pay/{tag} where anyone can pay them: buy one of their products, or pay an amount for something. Programs and AI agents can pay a board with plain HTTP and JSON. No account or API key is needed.

## Pay a board

Replace {tag} with the part before @nimbill (for ada@nimbill, the tag is ada).

${agentStepsText(origin)}

## Rules

${AGENT_RULES.map((r) => `- ${r}`).join("\n")}

## Pay with NimBill (for online stores)

A merchant's own store can create invoices on its board from its server and receive a webhook when each is paid. There is still no API key: the merchant's webhook secret (Settings → Webhooks) signs both ways.

- Create: POST ${origin}/api/pay/{tag}/invoices with the header NimBill-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>. Signed requests may add reference, metadata and returnUrl. Save invoice.id and send the customer to ${origin}/i/{invoice.id}.
- Receive: NimBill POSTs { id, type: "invoice.paid", test, data: { invoice } } to the store's URL, signed the same way. Verify it on the raw body, skip duplicate ids, match the order by invoice.id and check total and currency, answer 2xx within 10 seconds. Failures are retried for about 3 days.
- Guide: ${origin}/docs/webhooks

## Links

- [Developer docs](${origin}/docs): why and how, a quick start, and every endpoint with examples
- [AI assistants](${origin}/ai): setups for Claude, ChatGPT, Cursor, Grok and your own agent
- [MCP Agent Wallet](${origin}/mcp): give an MCP client its own Nimiq wallet
- [OpenAPI](${origin}/openapi.json): the API as OpenAPI 3.1
- [Agent skill](${origin}/skill.md): a SKILL.md to install the steps above as a skill
- [A board as JSON](${origin}/api/pay/{tag}): includes a howToPay section with that board's URLs filled in
- [Payments made with NimBill](${origin}/stats): public list, each with its transaction
`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
