import { eq } from "drizzle-orm";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { WaitlistBody } from "@/lib/withdraw/schemas";

// The waitlist for cash-outs to a bank or mobile money ("coming soon"). One entry per Nimiq address;
// joining again updates it. Open to every signed-in user, unlike crypto withdrawals.

export const GET = handle(async () => {
  const address = await requireSessionAddress();
  const db = await getDb();
  const [entry] = await db.select().from(schema.fiatWaitlist).where(eq(schema.fiatWaitlist.nimiqAddress, address));
  return json({ entry: entry ?? null });
});

export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = WaitlistBody.parse(await req.json());
  const db = await getDb();
  const [entry] = await db
    .insert(schema.fiatWaitlist)
    .values({ nimiqAddress: address, ...body })
    .onConflictDoUpdate({ target: schema.fiatWaitlist.nimiqAddress, set: { ...body, updatedAt: new Date() } })
    .returning();
  return json({ entry });
});
