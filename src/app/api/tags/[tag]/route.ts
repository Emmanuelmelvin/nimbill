import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { lookupTag } from "@/lib/merchant-tags";
import { formatTag } from "@/lib/tags";

// Public: who owns a tag. Used to show "you're paying Chidi Okeke, NQ42 …" before money moves.
export const GET = handle(async (_req: NextRequest, ctx: RouteContext<"/api/tags/[tag]">) => {
  const { tag } = await ctx.params;
  const owner = await lookupTag(decodeURIComponent(tag));
  if (!owner) throw Errors.notFound("No one has that tag. Check the spelling.");
  return json({ owner: { ...owner, handle: formatTag(owner.tag) } });
});
