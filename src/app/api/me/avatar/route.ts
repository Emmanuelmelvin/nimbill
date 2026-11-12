import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { removeAvatar, setAvatar } from "@/lib/avatars";
import { ProductImageBody } from "@/lib/schemas";

// My public photo. Set or replace it with a data URL (already cropped square and shrunk by the browser).
export const PUT = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const { dataUrl } = ProductImageBody.parse(await req.json());
  return json({ merchant: await setAvatar(address, dataUrl) });
});

// Remove it: initials are shown instead.
export const DELETE = handle(async () => {
  const address = await requireSessionAddress();
  return json({ merchant: await removeAvatar(address) });
});
