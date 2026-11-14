import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { endpointView, getEndpoint, queueTestEvent, recentEvents } from "@/lib/webhooks";

// Queue a "webhook.test" event. The webhook worker delivers it within a few seconds, like any other.
export const POST = handle(async () => {
  const address = await requireSessionAddress();
  rateLimit(`webhook-test:${address}`, 10, 10 * 60_000, "That's a lot of test events. Wait a few minutes and try again.");
  await queueTestEvent(address);
  const ep = await getEndpoint(address);
  return json({ endpoint: ep ? endpointView(ep, await recentEvents(address)) : null });
});
