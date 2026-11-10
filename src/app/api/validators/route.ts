import { handle, json } from "@/lib/api";
import { validators } from "@/lib/clients";

export const GET = handle(async () => json({ validators: await validators.list() }));
