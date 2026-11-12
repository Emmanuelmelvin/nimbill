import type { NextRequest } from "next/server";
import { AGENT_RULES, AGENT_STEPS, agentUrl } from "@/lib/agent-docs";
import { handle, json } from "@/lib/api";
import { getPublicBoard } from "@/lib/board-server";
import { Errors } from "@/lib/errors";
import { requestOrigin } from "@/lib/request-origin";

// Public: a merchant's board. Who they are, what they sell, whether any amount can be paid,
// and (for programs and AI agents) the exact steps to pay, with this board's URLs filled in.
export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/pay/[tag]">) => {
  const { tag } = await ctx.params;
  const board = await getPublicBoard(decodeURIComponent(tag));
  if (!board) throw Errors.notFound("No one has that tag. Check the link.");
  const origin = requestOrigin(req.headers);
  const values = { tag: board.merchant.tag };
  return json({
    ...board,
    howToPay: {
      assets: board.merchant.acceptsUsdt ? ["NIM", "USDT"] : ["NIM"],
      steps: AGENT_STEPS.map((s) => ({
        title: s.title,
        ...(s.method && s.path ? { method: s.method, url: agentUrl(origin, s.path, values) } : {}),
        ...(s.body ? { body: s.body } : {}),
        text: s.text,
      })),
      rules: AGENT_RULES,
      docs: `${origin}/docs`,
      openapi: `${origin}/openapi.json`,
    },
  });
});
