"use client";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Alert, Button, Card, Eyebrow, Header, LinkButton, Loader, PageTitle } from "@/components/ui";
import { api } from "@/lib/client/api";
import { formatFiat } from "@/lib/currencies";
import type { RecurringInterval } from "@/lib/db/schema";

type UnsubscribeInfo = {
  id: string;
  merchantName: string;
  clientName: string;
  currency: string;
  total: string;
  interval: RecurringInterval;
  status: "active" | "paused" | "cancelled";
  cancelledBy: "merchant" | "client" | null;
  lastInvoiceId: string | null;
};

const INTERVAL_TEXT: Record<RecurringInterval, string> = {
  weekly: "weekly",
  biweekly: "bi-weekly",
  monthly: "monthly",
  quarterly: "quarterly",
  yearly: "yearly",
};

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<Header />}>
      <UnsubscribeScreen />
    </Suspense>
  );
}

function UnsubscribeScreen() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<UnsubscribeInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justStopped, setJustStopped] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ recurring: UnsubscribeInfo }>(`/api/recurring/${id}/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => {
        setError(null);
        setInfo(r.recurring);
      })
      .catch((e) => setError((e as Error).message));
  }, [id, token]);

  const displayError = !token ? "Missing unsubscribe token. Open the link from your invoice email." : error;

  if (displayError) {
    return (
      <>
        <Header back="/" />
        <Alert kind="error">{displayError}</Alert>
      </>
    );
  }

  if (!info) {
    return (
      <>
        <Header back="/" />
        <Loader />
      </>
    );
  }

  const cadence = INTERVAL_TEXT[info.interval] ?? info.interval;
  const amount = formatFiat(info.total, info.currency);
  const stopped = info.status === "cancelled";

  return (
    <>
      <Header back={info.lastInvoiceId ? `/i/${info.lastInvoiceId}` : "/"} />
      <PageTitle title={stopped ? "Recurring invoices stopped" : "Stop recurring invoices?"} />
      <div className="space-y-4">
        {justStopped && (
          <Alert kind="success">
            You have unsubscribed. {info.merchantName} has been notified and no future {cadence} invoices will be sent for this schedule.
          </Alert>
        )}

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow>Recurring schedule</Eyebrow>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {amount} <span className="font-mono text-sm font-normal text-muted">/ {cadence}</span>
              </p>
            </div>
            <span className="inline-block border border-line bg-subtle px-2 py-0.5 font-mono text-[11px] tracking-wider text-muted uppercase">
              {stopped ? "Stopped" : info.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 border-y border-line py-3 text-sm">
            <div>
              <Eyebrow>From</Eyebrow>
              <p className="mt-1 font-semibold break-words">{info.merchantName}</p>
            </div>
            <div>
              <Eyebrow>Billed to</Eyebrow>
              <p className="mt-1 font-semibold break-words">{info.clientName}</p>
            </div>
          </div>

          {stopped ? (
            <p className="text-sm text-muted">
              This recurring schedule is no longer active. You won&apos;t receive any more future invoices from it. Any invoice that was
              already sent stays as it is.
            </p>
          ) : (
            <p className="text-sm text-muted">
              Stopping this schedule means no new {cadence} invoices will be generated or emailed to you from{" "}
              <strong className="text-ink">{info.merchantName}</strong>. Any invoice that was already sent stays open in case you still want
              to pay your current cycle.
            </p>
          )}

          {!stopped && (
            <Button
              variant="danger"
              size="lg"
              block
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const res = await api<{ recurring: UnsubscribeInfo }>(`/api/recurring/${id}/unsubscribe`, {
                    body: { token },
                  });
                  setInfo(res.recurring);
                  setJustStopped(true);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Unsubscribe from future invoices
            </Button>
          )}

          {info.lastInvoiceId && (
            <LinkButton href={`/i/${info.lastInvoiceId}`} variant="secondary" block>
              Back to invoice
            </LinkButton>
          )}
        </Card>
      </div>
    </>
  );
}
