"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import type { WebhookEndpointView } from "@/lib/webhooks";
import { Alert, Badge, Button, Card, Checkbox, CodeBlock, CopyButton, Eyebrow, Field, Input, Loader } from "./ui";

type Answer = { endpoint: WebhookEndpointView | null; secret?: string };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * "Pay with NimBill": where the merchant's store gets told about payments. One secret signs both
 * ways: the store signs the invoices it creates, NimBill signs every webhook it sends.
 */
export function WebhooksCard() {
  const [endpoint, setEndpoint] = useState<WebhookEndpointView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [returnOrigin, setReturnOrigin] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "rotate" | "delete" | "test">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function apply(ep: WebhookEndpointView | null) {
    setEndpoint(ep);
    setUrl(ep?.url ?? "");
    setReturnOrigin(ep?.returnOrigin ?? "");
    setEnabled(ep?.enabled ?? true);
  }

  useEffect(() => {
    api<Answer>("/api/webhooks")
      .then((r) => apply(r.endpoint))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, []);

  // While something is still waiting to go out, refresh the event list so the merchant sees it
  // delivered (or failing) without reloading. Only the list is updated, never what they're typing.
  const waiting = !!endpoint?.events.some((e) => e.status === "pending" && e.attempts === 0);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const r = await api<Answer>("/api/webhooks");
        if (r.endpoint) setEndpoint((cur) => (cur ? { ...cur, events: r.endpoint!.events } : r.endpoint));
      } catch {
        // offline for a moment; the next tick tries again
      }
    }, 3000);
    return () => clearInterval(t);
  }, [waiting]);

  async function run(kind: "save" | "rotate" | "delete" | "test", call: () => Promise<Answer>) {
    setBusy(kind);
    setError(null);
    setSaved(false);
    try {
      const r = await call();
      apply(r.endpoint);
      if (r.secret) setSecret(r.secret);
      if (kind === "save" && !r.secret) setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!loaded)
    return (
      <Card>
        <Loader compact label="Loading webhooks" />
      </Card>
    );

  return (
    <Card className="space-y-4">
      <div>
        <Eyebrow>Pay with NimBill</Eyebrow>
        <h2 className="mt-1 text-lg font-bold">Webhooks</h2>
        <p className="mt-1 text-sm text-muted">
          Have a shop? Your store creates invoices on your board, customers pay straight into your wallet, and your server gets a signed
          message the moment each one is paid. No API key: one secret signs both ways.
        </p>
      </div>

      {secret && (
        <Alert kind="warn">
          <div className="space-y-2">
            <p className="font-semibold">Copy your webhook secret now. It won&apos;t be shown again.</p>
            <CodeBlock className="text-xs break-all">{secret}</CodeBlock>
            <div className="flex flex-wrap gap-2">
              <CopyButton text={secret} label="Copy secret" size="sm" className="min-h-11" />
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setSecret(null)}>
                I&apos;ve saved it
              </Button>
            </div>
            <p className="text-xs">Keep it on your store&apos;s server only, never in a web page or an app.</p>
          </div>
        </Alert>
      )}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run("save", () =>
            api<Answer>("/api/webhooks", { body: { url, returnOrigin: returnOrigin.trim() || null, ...(endpoint ? { enabled } : {}) } }),
          );
        }}
      >
        <Field label="Webhook URL" htmlFor="webhook-url" hint="Your server's address that receives the messages. Must start with https://">
          <Input
            id="webhook-url"
            mono
            inputMode="url"
            autoComplete="off"
            placeholder="https://shop.example.com/nimbill/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field
          label="Store address"
          htmlFor="webhook-return"
          optional
          hint="Customers can be sent back here after paying (returnUrl). Links to anywhere else are refused."
        >
          <Input
            id="webhook-return"
            mono
            inputMode="url"
            autoComplete="off"
            placeholder="https://shop.example.com"
            value={returnOrigin}
            onChange={(e) => setReturnOrigin(e.target.value)}
          />
        </Field>
        {endpoint && (
          <Checkbox
            label="Webhooks on"
            description="Off: your store's signed requests are refused and nothing is sent."
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        )}
        {error && <Alert kind="error">{error}</Alert>}
        {saved && <Alert kind="success">Saved.</Alert>}
        <Button type="submit" block loading={busy === "save"} loadingText="Saving…" disabled={!!busy || !url.trim()}>
          {endpoint ? "Save" : "Turn on webhooks"}
        </Button>
      </form>

      {endpoint && (
        <>
          <div className="space-y-2 border-t border-line pt-4">
            <Eyebrow>Secret</Eyebrow>
            {endpoint.previousSecretValidUntil && (
              <p className="text-sm text-muted">Your previous secret keeps working until {when(endpoint.previousSecretValidUntil)}.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11"
                loading={busy === "rotate"}
                disabled={!!busy}
                onClick={() => {
                  if (!confirm("Make a new secret? The current one keeps working for 24 hours, so you can update your store.")) return;
                  void run("rotate", () => api<Answer>("/api/webhooks/rotate", { method: "POST" }));
                }}
              >
                New secret
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="min-h-11"
                loading={busy === "delete"}
                disabled={!!busy}
                onClick={() => {
                  if (!confirm("Turn webhooks off and delete the secret? Your store's signed requests stop working at once.")) return;
                  void run("delete", () => api<Answer>("/api/webhooks", { method: "DELETE" }));
                }}
              >
                Remove
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>Recent events</Eyebrow>
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11"
                loading={busy === "test"}
                loadingText="Sending…"
                disabled={!!busy || !endpoint.enabled}
                onClick={() => void run("test", () => api<Answer>("/api/webhooks/test", { method: "POST" }))}
              >
                Send test event
              </Button>
            </div>
            {endpoint.events.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing yet. Events show up here when an invoice your store created is paid. Send a test event to check your server.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {endpoint.events.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block font-mono">{e.type}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.invoiceId} · {when(e.createdAt)}
                        {e.lastError ? ` · ${e.lastError}` : e.lastStatus ? ` · HTTP ${e.lastStatus}` : ""}
                      </span>
                    </span>
                    <Badge variant={e.status === "delivered" ? "solid" : e.status === "failed" ? "strong" : "outline"}>
                      {e.status === "pending" && e.attempts > 0 ? `retrying (${e.attempts})` : e.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
