import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { getAllRates } from "@/lib/rates";
import { RatesQuery } from "@/lib/schemas";

export const GET = handle(async (req: NextRequest) => {
  const { currency } = RatesQuery.parse({ currency: req.nextUrl.searchParams.get("currency") ?? undefined });
  return json({ currency, rates: await getAllRates(currency) });
});
