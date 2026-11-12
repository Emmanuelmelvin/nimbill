"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type PublicInvoice } from "@/lib/client/api";
import { AppError } from "@/lib/errors";
import { parseNimbillNumber } from "@/lib/nimbill-number";
import { Alert, Button, Card, CardHeader, Field, Input } from "./ui";

/** Where a client pastes the Nimbill number they were sent, to open the invoice and pay it. */
export function PayByNumber({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const id = parseNimbillNumber(value);
          if (!id) {
            setError("That doesn't look like a Nimbill number. It looks like NMN-K7M2P-9QX4Z.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            // Check it exists first, so a typo gets a clear message here instead of a dead page.
            await api<{ invoice: PublicInvoice }>(`/api/invoices/${id}`);
            router.push(`/i/${id}`);
          } catch (err) {
            setError(
              err instanceof AppError && err.code === "NOT_FOUND"
                ? "No invoice has that Nimbill number. Check it with whoever sent it."
                : (err as Error).message,
            );
            setBusy(false);
          }
        }}
      >
        <CardHeader title="Pay an invoice" description="Got a Nimbill number? Paste it here to see the invoice and pay it." />
        <Field label="Nimbill number" htmlFor="nmn">
          <Input
            id="nmn"
            mono
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="NMN-XXXXX-XXXXX"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            maxLength={200}
          />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" variant="secondary" block loading={busy} disabled={!value.trim()}>
          Find invoice
        </Button>
      </form>
    </Card>
  );
}
