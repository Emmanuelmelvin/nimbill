import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { NewTransferBody } from "@/lib/schemas";
import { createTransfer, listTransfers, reconcileTransfers, transferMemo, transferView } from "@/lib/transfers";

// My transfers, sent and received. Also picks up sends whose hash the wallet never returned.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileTransfers(address);
  const transfers = await listTransfers(address);
  return json({ transfers: transfers.map((t) => transferView(t, address)) });
});

// Start a transfer. The answer says exactly what the wallet must send: to whom, how much, with which data.
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = NewTransferBody.parse(await req.json());
  const t = await createTransfer(address, body);
  return json(
    {
      transfer: transferView(t, address),
      payment: { recipient: t.toAddress, amount: t.amount, memo: transferMemo(t.id), rate: t.rate },
    },
    201,
  );
});
