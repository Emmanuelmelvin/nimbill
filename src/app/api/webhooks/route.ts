import { z } from "zod";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { ensureMerchant } from "@/lib/invoices";
import { deleteEndpoint, endpointView, getEndpoint, recentEvents, saveEndpoint } from "@/lib/webhooks";

// "Pay with NimBill": the signed-in merchant's webhook endpoint (Settings → Webhooks).
// Not open to other sites: only NimBill itself, with the merchant's session.

const Body = z.object({
  url: z.string().trim().min(1, "Enter the URL your store receives webhooks on").max(500, "That URL is too long"),
  // Where payers may be sent back to after paying. Empty clears it.
  returnOrigin: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function view(address: string) {
  const ep = await getEndpoint(address);
  return ep ? endpointView(ep, await recentEvents(address)) : null;
}

export const GET = handle(async () => {
  const address = await requireSessionAddress();
  return json({ endpoint: await view(address) });
});

// Create (the answer carries the secret, this one time only) or change the settings.
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = Body.parse(await req.json());
  await ensureMerchant(address);
  const { secret } = await saveEndpoint(address, body);
  return json({ endpoint: await view(address), ...(secret ? { secret } : {}) });
});

export const DELETE = handle(async () => {
  const address = await requireSessionAddress();
  await deleteEndpoint(address);
  return json({ endpoint: null });
});
