import { z } from "zod";
import { handle, json } from "@/lib/api";
import { setSession, verifySignIn } from "@/lib/auth";
import { Errors } from "@/lib/errors";
import { ensureMerchant } from "@/lib/invoices";

const Body = z.object({
  message: z.string().max(500),
  publicKey: z.string(),
  signature: z.string(),
});

export const POST = handle(async (req: Request) => {
  const { message, publicKey, signature } = Body.parse(await req.json());
  const address = verifySignIn(message, publicKey, signature);
  if (!address) throw Errors.unauthorized("Sign-in could not be verified. Please try again.");
  await setSession(address);
  const merchant = await ensureMerchant(address);
  return json({ merchant });
});
