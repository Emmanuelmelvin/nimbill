import { eq } from "drizzle-orm";
import { getSessionAddress } from "@/lib/auth";
import { handle, json } from "@/lib/api";
import { getDb, schema } from "@/lib/db";

export const GET = handle(async () => {
  const address = await getSessionAddress();
  if (!address) return json({ merchant: null });
  const db = await getDb();
  const [merchant] = await db.select().from(schema.merchants).where(eq(schema.merchants.address, address));
  return json({ merchant: merchant ?? { address, name: "", evmAddress: null, email: null } });
});
