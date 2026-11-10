import { handle, json } from "@/lib/api";
import { getValidators } from "@/lib/chain";

export const GET = handle(async () => json({ validators: await getValidators() }));
