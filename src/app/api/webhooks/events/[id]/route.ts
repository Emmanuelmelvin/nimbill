import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { buildPayload } from "@/lib/webhook-delivery";
import { getEvent } from "@/lib/webhooks";

// One of the signed-in merchant's webhook events, opened in Settings → Webhooks, with the JSON body
// the store receives. The body is built the same way the worker builds it (it isn't stored), so for
// invoice events it shows the invoice as it is now. Only the event's owner can see it.
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/webhooks/events/[id]">) => {
  const address = await requireSessionAddress();
  const { id } = await ctx.params;
  const ev = /^evt_[a-z0-9]{1,40}$/.test(id) ? await getEvent(address, id) : null;
  if (!ev) throw Errors.notFound("That event doesn't exist.");
  return json({ body: await buildPayload(ev) });
});
