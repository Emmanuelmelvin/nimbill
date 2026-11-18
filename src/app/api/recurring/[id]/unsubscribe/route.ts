import type { NextRequest } from "next/server";
import { handle, json } from "@/lib/api";
import { Errors } from "@/lib/errors";
import { getRecurringInvoice, unsubscribeRecurringSchedule, verifyUnsubscribeToken } from "@/lib/recurring";
import { RecurringUnsubscribeBody } from "@/lib/schemas";

function publicScheduleForUnsubscribe(rec: NonNullable<Awaited<ReturnType<typeof getRecurringInvoice>>>) {
  return {
    id: rec.id,
    merchantName: rec.merchantName,
    clientName: rec.clientName,
    currency: rec.currency,
    total: rec.total,
    interval: rec.interval,
    status: rec.status,
    cancelledBy: rec.cancelledBy ?? null,
    lastInvoiceId: rec.lastInvoiceId,
  };
}

export const GET = handle(async (req: NextRequest, ctx: RouteContext<"/api/recurring/[id]/unsubscribe">) => {
  const { id } = await ctx.params;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!verifyUnsubscribeToken(id, token)) {
    throw Errors.forbidden("This unsubscribe link is invalid.");
  }
  const rec = await getRecurringInvoice(id);
  if (!rec) throw Errors.notFound("Recurring schedule not found.");
  return json({ recurring: publicScheduleForUnsubscribe(rec) });
});

export const POST = handle(async (req: NextRequest, ctx: RouteContext<"/api/recurring/[id]/unsubscribe">) => {
  const { id } = await ctx.params;
  const { token } = RecurringUnsubscribeBody.parse(await req.json());
  const { recurring, alreadyCancelled } = await unsubscribeRecurringSchedule(id, token);
  return json({
    recurring: publicScheduleForUnsubscribe(recurring),
    alreadyCancelled,
  });
});
