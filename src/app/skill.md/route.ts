import type { NextRequest } from "next/server";
import { skillMarkdown } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

// /skill.md: the "nimbill-pay" agent skill, ready to save as SKILL.md (see /docs#setup).
export function GET(req: NextRequest) {
  return new Response(skillMarkdown(requestOrigin(req.headers)), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}
