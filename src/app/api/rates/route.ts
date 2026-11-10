import { NextRequest } from "next/server";
import { fail, handle, json } from "@/lib/api";
import { CURRENCY_CODES } from "@/lib/currencies";
import { getAllRates } from "@/lib/rates";

export const GET = handle(async (req: NextRequest) => {
  const currency = (req.nextUrl.searchParams.get("currency") || "USD").toUpperCase();
  if (!(CURRENCY_CODES as readonly string[]).includes(currency)) return fail("Unsupported currency");
  return json({ currency, rates: await getAllRates(currency) });
});
