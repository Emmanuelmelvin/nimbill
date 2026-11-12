import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getAvatarByTag } from "@/lib/avatars";
import { corsPreflight, withCors } from "@/lib/cors";
import { Errors } from "@/lib/errors";
import { normalizeTag } from "@/lib/tags";

// Public: the photo of a tag's owner. Its URL carries a version, so it can be cached for good.
// Open to other sites (CORS), like the rest of the public API.
export const OPTIONS = corsPreflight(["GET"]);
export const GET = withCors(
  ["GET"],
  handle(async (_req: NextRequest, ctx: RouteContext<"/api/avatars/[tag]">) => {
    const { tag } = await ctx.params;
    const img = await getAvatarByTag(normalizeTag(decodeURIComponent(tag)));
    if (!img) throw Errors.notFound("No photo for that tag.");
    return new Response(new Uint8Array(img.bytes), {
      headers: { "content-type": img.mime, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" },
    });
  }),
);
