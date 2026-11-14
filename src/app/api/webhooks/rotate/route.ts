import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { ROTATION_OVERLAP_MS, endpointView, recentEvents, rotateSecret } from "@/lib/webhooks";

// A new webhook secret, shown once. The old one keeps working for 24 hours.
export const POST = handle(async () => {
  const address = await requireSessionAddress();
  const { endpoint, secret } = await rotateSecret(address);
  return json({ endpoint: endpointView(endpoint, await recentEvents(address)), secret, overlapHours: ROTATION_OVERLAP_MS / 3_600_000 });
});
