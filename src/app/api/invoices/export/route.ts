import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { LUNA_PER_NIM, USDT_DECIMALS } from "@/lib/currencies";
import { listPaidInvoices, prepareLedger } from "@/lib/ledger";
import { ExportQuery } from "@/lib/schemas";

const DAYS = { "30d": 30, "90d": 90, "1y": 365, all: undefined } as const;

/** One CSV cell. Text starting with = + - @ gets a leading quote so spreadsheets don't run it as a formula. */
function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Paid invoices as a CSV file, for bookkeeping and tax.
export const GET = handle(async (req: NextRequest) => {
  const address = await requireSessionAddress();
  const { range } = ExportQuery.parse({ range: req.nextUrl.searchParams.get("range") ?? undefined });
  await prepareLedger(address); // fills in dollar values that are still missing
  const invoices = await listPaidInvoices(address, DAYS[range]);
  const header = [
    "Invoice",
    "Client",
    "Client email",
    "Invoice date",
    "Paid at (UTC)",
    "Currency",
    "Total",
    "Tip",
    "Paid in",
    "Amount received",
    "Rate (currency per coin)",
    "Value in USD",
    "Transaction",
    "Paid from",
  ];
  const lines = invoices.map((i) => {
    const coins = Number(i.paidAmount ?? 0) / (i.paidAsset === "NIM" ? LUNA_PER_NIM : 10 ** USDT_DECIMALS);
    return [
      i.number,
      i.clientName,
      i.clientEmail,
      i.createdAt.toISOString().slice(0, 10),
      i.paidAt?.toISOString(),
      i.currency,
      Number(i.total),
      Number(i.paidTip ?? 0),
      i.paidAsset,
      coins,
      i.paidRate === null ? null : Number(i.paidRate),
      i.paidUsd === null ? null : Number(Number(i.paidUsd).toFixed(2)),
      i.paidTxHash,
      i.paidFrom,
    ]
      .map(cell)
      .join(",");
  });
  // The BOM makes Excel read the file as UTF-8 (client names, ₦ …).
  const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="nimbill-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
});
