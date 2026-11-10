import { z } from "zod";
import { setSession, verifySignIn } from "@/lib/auth";
import { fail, handle, json } from "@/lib/api";
import { ensureMerchant } from "@/lib/invoices";

const Body = z.object({
  message: z.string().max(500),
  publicKey: z.string(),
  signature: z.string(),
});

export const POST = handle(async (req: Request) => {
  const { message, publicKey, signature } = Body.parse(await req.json());
  const address = verifySignIn(message, publicKey, signature);
  if (!address) return fail("Sign-in could not be verified. Please try again.", 401);
  await setSession(address);
  const merchant = await ensureMerchant(address);
  return json({ merchant });
});
