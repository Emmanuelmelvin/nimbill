"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { FAILING_REMOVE_AFTER_DAYS, FAILING_WARN_AFTER_HOURS } from "@/lib/webhook-policy";
import type { WebhookEndpointView } from "@/lib/webhooks";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CodeBlock,
  CopyButton,
  DescriptionList,
  Eyebrow,
  Field,
  Input,
  Loader,
  cardStyles,
  cx,
  type DescriptionRow,
} from "./ui";

type Answer = { endpoint: WebhookEndpointView | null; secret?: string };
type EventView = WebhookEndpointView["events"][number];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const exact = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

const statusLabel = (e: EventView) => (e.status === "pending" && e.attempts > 0 ? `retrying (${e.attempts})` : e.status);

/** One event in "Recent events". Opens to show its details and the JSON body the store gets. */
function EventRow({ event: e }: { event: EventView }) {
  const [body, setBody] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  async function loadBody() {
    if (body !== null) return;
    setBodyError(null);
    try {
      const r = await api<{ body: unknown }>(`/api/webhooks/events/${e.id}`);
      setBody(r.body ? JSON.stringify(r.body, null, 2) : "");
    } catch (err) {
      setBodyError((err as Error).message);
    }
  }

  const rows: DescriptionRow[] = [
    {
      term: "Event ID",
      detail: (
        <span className="flex items-center gap-2">
          {e.id}
          <CopyButton text={e.id} size="sm" label="Copy" />
        </span>
      ),
      mono: true,
    },
    { term: "Type", detail: e.type, mono: true },
    { term: e.type === "webhook.test" ? "Test ID" : "Invoice", detail: e.invoiceId, mono: true },
    { term: "Status", detail: statusLabel(e) },
    { term: "Attempts", detail: String(e.attempts) },
    { term: "Created", detail: exact(e.createdAt) },
  ];
  if (e.deliveredAt) rows.push({ term: "Delivered", detail: exact(e.deliveredAt) });
  if (e.nextAttemptAt && e.attempts > 0) rows.push({ term: "Next try", detail: exact(e.nextAttemptAt) });
  if (e.lastStatus !== null) rows.push({ term: "Your server", detail: `HTTP ${e.lastStatus}` });
  else if (e.attempts > 0) rows.push({ term: "Your server", detail: "No answer" });
  if (e.lastError) rows.push({ term: "Last error", detail: e.lastError, mono: true });

  return (
    <li>
      <details
        className="group/event"
        onToggle={(ev) => {
          if (ev.currentTarget.open) void loadBody();
        }}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block font-mono">{e.type}</span>
            <span className="block truncate text-xs text-muted">
              {when(e.createdAt)}
              {e.lastError ? ` · ${e.lastError}` : e.lastStatus ? ` · HTTP ${e.lastStatus}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <Badge variant={e.status === "delivered" ? "solid" : e.status === "failed" ? "strong" : "outline"}>{statusLabel(e)}</Badge>
            <span aria-hidden className="font-mono text-base transition-transform group-open/event:rotate-45">
              +
            </span>
          </span>
        </summary>
        <div className="space-y-3 pb-3 text-sm">
          <DescriptionList rows={rows} />
          <div className="space-y-1">
            <Eyebrow>Body</Eyebrow>
            {bodyError ? (
              <Alert kind="error">{bodyError}</Alert>
            ) : body === null ? (
              <Loader compact label="Loading body" />
            ) : body === "" ? (
              <p className="text-muted">The invoice no longer exists, so there is no body to show.</p>
            ) : (
              <>
                <pre className="max-h-80 overflow-auto border border-line bg-subtle p-3 font-mono text-xs leading-relaxed">{body}</pre>
                <p className="text-xs text-muted">
                  {e.type === "webhook.test"
                    ? "What your server was sent."
                    : "Built from the invoice as it is now, the same way it's sent."}
                </p>
              </>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

/** Whether saving the form turns webhooks on: yes for a new endpoint and after NimBill removed them. */
const formEnabled = (ep: WebhookEndpointView | null) => (ep ? ep.health.state === "removed" || ep.enabled : true);

/**
 * "Pay with NimBill" in Settings: closed by default and tagged for developers, so merchants without
 * an online store aren't faced with webhook URLs and secrets. The header still says when the URL is
 * failing or was removed, and /settings#webhooks (the dashboard and email link) opens it.
 */
export function WebhooksCard() {
  const ref = useRef<HTMLDetailsElement>(null);
  const [opened, setOpened] = useState(false);
  const [endpoint, setEndpoint] = useState<WebhookEndpointView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<Answer>("/api/webhooks")
      .then((r) => setEndpoint(r.endpoint))
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoaded(true));
    if (window.location.hash === "#webhooks" && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView({ block: "start" });
    }
  }, []);

  // While something is still waiting to go out, refresh the event list so the merchant sees it
  // delivered (or failing) without reloading. Only the endpoint is updated, never what they're typing.
  const waiting = !!endpoint?.events.some((e) => e.status === "pending" && e.attempts === 0);
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(async () => {
      try {
        const r = await api<Answer>("/api/webhooks");
        if (r.endpoint) setEndpoint(r.endpoint);
      } catch {
        // offline for a moment; the next tick tries again
      }
    }, 3000);
    return () => clearInterval(t);
  }, [waiting]);

  const state = endpoint?.health.state;
  return (
    <details
      ref={ref}
      id="webhooks"
      className={cx(cardStyles({ padding: "none" }), "group scroll-mt-4")}
      onToggle={(e) => {
        if (e.currentTarget.open) setOpened(true);
      }}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg leading-tight font-bold">Webhooks</span>
            <Badge variant="muted">For developers</Badge>
            {state === "removed" && <Badge variant="solid">Removed</Badge>}
            {(state === "warned" || state === "failing") && <Badge variant="strong">Failing</Badge>}
          </span>
          <span className="mt-1 block text-sm text-muted">Connect your online store to NimBill. Not needed for everyday invoicing.</span>
        </span>
        <span aria-hidden className="font-mono text-lg leading-tight transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      {/* Stays mounted once opened, so closing and reopening keeps what was typed. */}
      <div className="border-t border-line p-5">
        {!opened ? null : !loaded ? (
          <Loader compact label="Loading webhooks" />
        ) : loadError ? (
          <Alert kind="error">{loadError}</Alert>
        ) : (
          <WebhooksPanel endpoint={endpoint} setEndpoint={setEndpoint} />
        )}
      </div>
    </details>
  );
}

/** What the merchant must know about a failing or removed URL, with what to do about it. */
function HealthNotice({ health }: { health: WebhookEndpointView["health"] }) {
  if (health.state === "removed")
    return (
      <Alert kind="error" title="Webhooks were removed">
        Your URL kept failing, so NimBill turned webhooks off on {health.removedAt ? when(health.removedAt) : "—"}. Your store gets no
        webhooks and its signed requests are refused. Fix your server, then press Save to turn them back on. Your secret hasn&apos;t
        changed.
      </Alert>
    );
  if (health.state === "warned")
    return (
      <Alert kind="warn" title="Your webhook URL is failing">
        Every delivery since {health.failingSince ? when(health.failingSince) : "—"} has failed ({health.consecutiveFailures} attempts in a
        row). Fix your server or change the URL by {health.removeAt ? when(health.removeAt) : "—"}, or webhooks will be removed. The first
        webhook that gets through clears this.
      </Alert>
    );
  if (health.state === "failing")
    return (
      <Alert kind="info" title="Recent deliveries failed">
        The last {health.consecutiveFailures === 1 ? "delivery" : `${health.consecutiveFailures} deliveries`} to your server failed. If
        every delivery keeps failing for {FAILING_WARN_AFTER_HOURS} hours you&apos;ll get a warning, and after {FAILING_REMOVE_AFTER_DAYS}{" "}
        days webhooks are removed. Open an event below to see what your server answered.
      </Alert>
    );
  return null;
}

/**
 * Where the merchant's store gets told about payments. One secret signs both ways: the store signs
 * the invoices it creates, NimBill signs every webhook it sends.
 */
function WebhooksPanel({
  endpoint,
  setEndpoint,
}: {
  endpoint: WebhookEndpointView | null;
  setEndpoint: (ep: WebhookEndpointView | null) => void;
}) {
  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [returnOrigin, setReturnOrigin] = useState(endpoint?.returnOrigin ?? "");
  const [enabled, setEnabled] = useState(formEnabled(endpoint));
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "rotate" | "delete" | "test">(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function apply(ep: WebhookEndpointView | null) {
    setEndpoint(ep);
    setUrl(ep?.url ?? "");
    setReturnOrigin(ep?.returnOrigin ?? "");
    setEnabled(formEnabled(ep));
  }

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

  return (
    <div className="space-y-4">
      {endpoint && <HealthNotice health={endpoint.health} />}
      <div>
        <Eyebrow>Pay with NimBill</Eyebrow>
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
              <ul className="divide-y divide-line border-y border-line">
                {endpoint.events.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
