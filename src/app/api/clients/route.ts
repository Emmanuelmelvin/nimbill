import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { listClients, saveClient } from "@/lib/clients-book";
import { ensureMerchant } from "@/lib/invoices";
import { ClientBody } from "@/lib/schemas";

// The people this merchant bills: saved clients, plus anyone invoiced before.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  return json({ clients: await listClients(address) });
});

// Save a client for later (or update the saved one with the same name).
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = ClientBody.parse(await req.json());
  await ensureMerchant(address);
  return json({ client: await saveClient(address, body) }, 201);
});
