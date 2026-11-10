import { handle, json } from "@/lib/api";
import { getStats } from "@/lib/invoices";

export const GET = handle(async () => json(await getStats()));
