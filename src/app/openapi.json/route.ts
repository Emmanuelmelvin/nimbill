import type { NextRequest } from "next/server";
import { openApiSpec } from "@/lib/api-reference";
import { requestOrigin } from "@/lib/request-origin";

// /openapi.json: the public API for ChatGPT actions, code generators and other tools.
export function GET(req: NextRequest) {
  return Response.json(openApiSpec(requestOrigin(req.headers)), {
    headers: { "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}
