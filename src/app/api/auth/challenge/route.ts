import { createChallenge } from "@/lib/auth";
import { handle, json } from "@/lib/api";

export const GET = handle(async (req: Request) => {
  const host = req.headers.get("host") || "nimbill";
  return json({ message: createChallenge(host) });
});
