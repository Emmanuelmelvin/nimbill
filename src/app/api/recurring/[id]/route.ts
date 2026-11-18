import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { publicInvoice } from "@/lib/invoices";
import { publicRecurringInvoice, updateRecurringSchedule } from "@/lib/recurring";
import { RecurringPatchBody } from "@/lib/schemas";

export const PATCH = handle(async (req: NextRequest, ctx: RouteContext<"/api/recurring/[id]">) => {
  const { id } = await ctx.params;
  const address = await requireSessionAddress();
  const { action } = RecurringPatchBody.parse(await req.json());
  const { recurring, invoice } = await updateRecurringSchedule(id, address, action);
  return json({
    recurring: publicRecurringInvoice(recurring),
    invoice: invoice ? publicInvoice(invoice) : null,
  });
});
