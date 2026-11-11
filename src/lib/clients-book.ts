import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { Errors } from "./errors";
import { newId } from "./invoices";

// A merchant's address book: clients saved for quick re-use on the next invoice.
// (lib/clients is the folder of external API clients, hence the different name.)

const keyOf = (name: string) => name.trim().toLowerCase();

/** A client that can be picked on the new-invoice form. `id` is null for one that is not saved. */
export type BookClient = { id: string | null; name: string; email: string | null; saved: boolean };

/**
 * Saved clients first (A–Z), then anyone billed before who was never saved, newest first.
 * Past clients are included so the picker is useful from day one.
 */
export async function listClients(merchantAddress: string): Promise<BookClient[]> {
  const db = await getDb();
  const saved = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.merchantAddress, merchantAddress))
    .orderBy(asc(schema.clients.nameKey));
  const out: BookClient[] = saved.map((c) => ({ id: c.id, name: c.name, email: c.email, saved: true }));
  const seen = new Set(saved.map((c) => c.nameKey));
  const past = await db
    .select({ name: schema.invoices.clientName, email: schema.invoices.clientEmail })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.merchantAddress, merchantAddress), eq(schema.invoices.isDemo, false)))
    .orderBy(desc(schema.invoices.createdAt))
    .limit(200);
  for (const p of past) {
    const key = keyOf(p.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: null, name: p.name.trim(), email: p.email, saved: false });
  }
  return out;
}

/** Save a client, or update the saved one with the same name (ignoring case). */
export async function saveClient(merchantAddress: string, input: { name: string; email?: string | null }): Promise<BookClient> {
  const db = await getDb();
  const name = input.name.trim();
  const email = input.email?.trim() || null;
  const [row] = await db
    .insert(schema.clients)
    .values({ id: newId(), merchantAddress, name, nameKey: keyOf(name), email })
    .onConflictDoUpdate({ target: [schema.clients.merchantAddress, schema.clients.nameKey], set: { name, email } })
    .returning();
  return { id: row.id, name: row.name, email: row.email, saved: true };
}

export async function removeClient(merchantAddress: string, id: string): Promise<void> {
  const db = await getDb();
  const rows = await db
    .delete(schema.clients)
    .where(and(eq(schema.clients.id, id), eq(schema.clients.merchantAddress, merchantAddress)))
    .returning({ id: schema.clients.id });
  if (!rows.length) throw Errors.notFound("Client not found.");
}
