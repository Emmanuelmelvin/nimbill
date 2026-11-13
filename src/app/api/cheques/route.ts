import { handle, json } from "@/lib/api";
import { requireSessionAddress } from "@/lib/auth";
import { chequeMemo, createCheque, listCheques, publicChequeView, publicChequeViews, reconcileWriterCheques } from "@/lib/cheques";
import { NewChequeBody } from "@/lib/schemas";

// Cheques written by the signed-in user. Also checks the blockchain for recent funding or cashing.
export const GET = handle(async () => {
  const address = await requireSessionAddress();
  await reconcileWriterCheques(address);
  const rows = await listCheques(address);
  return json({ cheques: await publicChequeViews(rows, address) });
});

// Start writing a cheque. The browser sends only `linkPublicKey` (never the secret);
// the answer tells the wallet which `chequeAddress` to fund and with what memo.
export const POST = handle(async (req: Request) => {
  const address = await requireSessionAddress();
  const body = NewChequeBody.parse(await req.json());
  const { cheque } = await createCheque(address, body);
  return json(
    {
      cheque: await publicChequeView(cheque, address),
      payment: {
        recipient: cheque.chequeAddress,
        amount: cheque.amount,
        memo: chequeMemo(cheque.id),
        rate: cheque.rate,
      },
    },
    201,
  );
});
