import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { listBoardOrders } from "@/lib/board-server";
import { publicInvoice, reconcileMerchant } from "@/lib/invoices";
import { invoiceUsd, prepareLedger } from "@/lib/ledger";

// The owner's board orders. Picks up payments we haven't seen yet first.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileMerchant(address);
  const { fx, currency } = await prepareLedger(address);
  const orders = await listBoardOrders(address);
  return json({ orders: orders.map((i) => ({ ...publicInvoice(i), usd: invoiceUsd(i, fx) })), fx, currency });
});
