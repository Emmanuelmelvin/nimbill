import { clearSession } from "@/lib/auth";
import { handle, json } from "@/lib/api";

export const POST = handle(async () => {
  await clearSession();
  return json({ ok: true });
});
