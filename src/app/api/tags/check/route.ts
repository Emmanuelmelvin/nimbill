import type { NextRequest } from "next/server";
import { z } from "zod";
import { handle, json } from "@/lib/api";
import { getSessionAddress } from "@/lib/auth";
import { tagUnavailableReason } from "@/lib/merchant-tags";
import { normalizeTag } from "@/lib/tags";

const Query = z.object({ tag: z.string().max(60, "That tag is too long.") });

// Is this tag free for me? Answers while someone types in the tag field. Your own tag counts as free.
export const GET = handle(async (req: NextRequest) => {
  const { tag } = Query.parse({ tag: req.nextUrl.searchParams.get("tag") ?? "" });
  const reason = await tagUnavailableReason(tag, await getSessionAddress());
  return json({ tag: normalizeTag(tag), available: !reason, message: reason });
});
