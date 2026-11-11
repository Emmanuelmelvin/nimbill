"use client";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import type { PublicGoal } from "@/lib/client/ledger";
import { goalProgress, localDate, parseLocalDate, type EarningPoint } from "@/lib/earnings";
import { formatUnit, type Fx } from "@/lib/money";
import { CurrencySelect } from "./CurrencySelect";
import { Alert, Badge, Button, Card, CardHeader, Disclosure, Field, Input, TextButton } from "./ui";

const shortDate = (s: string, withYear = false) =>
  parseLocalDate(s).toLocaleDateString(
    "en",
    withYear ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" },
  );

/** The goal that has not ended yet, if there is one. */
export function currentGoal(goals: PublicGoal[]): PublicGoal | null {
  const today = localDate();
  return goals.find((g) => g.endDate >= today) ?? null;
}

/** A goal with its progress bar, how much time is left and the pace needed to get there. */
export function GoalProgress({
  goal,
  points,
  fx,
  action,
}: {
  goal: PublicGoal;
  points: EarningPoint[];
  fx: Fx | null;
  action?: ReactNode;
}) {
  const p = goalProgress(goal, points, fx);
  const amount = (n: number) => formatUnit(n, goal.currency);
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  const badge = p.reached
    ? { text: "Reached", variant: "solid" as const }
    : p.state === "upcoming"
      ? { text: `Starts ${shortDate(goal.startDate)}`, variant: "muted" as const }
      : p.state === "ended"
        ? { text: "Missed", variant: "muted" as const }
        : p.onTrack
          ? { text: "On track", variant: "outline" as const }
          : { text: "Behind", variant: "strong" as const };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg leading-tight font-bold">{goal.title}</h3>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {shortDate(goal.startDate)} – {shortDate(goal.endDate, true)}
          </p>
        </div>
        <Badge variant={badge.variant}>{badge.text}</Badge>
      </div>

      <div
        role="progressbar"
        aria-label={`Progress towards ${goal.title}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.fraction * 100)}
        className="h-4 border border-ink"
      >
        <div className="h-full bg-ink" style={{ width: `${p.fraction * 100}%` }} />
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words tabular-nums">
          <span className="text-xl font-bold">{p.earned === null ? "—" : amount(p.earned)}</span>
          <span className="text-sm text-muted"> of {amount(p.target)}</span>
        </p>
        <p className="shrink-0 font-mono text-sm font-semibold">{Math.floor(p.fraction * 100)}%</p>
      </div>

      <p className="text-sm text-muted">
        {p.earned === null
          ? "Live rates are unavailable right now, so progress can't be worked out."
          : p.reached
            ? p.state === "ended"
              ? "You hit this goal."
              : `You hit this goal with ${days(p.daysLeft)} to spare.`
            : p.state === "ended"
              ? `Ended ${amount(p.target - p.earned)} short.`
              : p.state === "upcoming"
                ? `Runs for ${days(p.daysTotal)}. That is ${amount(p.target / p.daysTotal)} a day.`
                : `${days(p.daysLeft)} left. You need ${amount(p.perDayNeeded ?? 0)} a day to get there.`}
      </p>
      {action}
    </div>
  );
}

const PRESETS = [
  { label: "This month", dates: (t: Date) => [t, new Date(t.getFullYear(), t.getMonth() + 1, 0)] },
  { label: "30 days", dates: (t: Date) => [t, new Date(t.getFullYear(), t.getMonth(), t.getDate() + 29)] },
  { label: "90 days", dates: (t: Date) => [t, new Date(t.getFullYear(), t.getMonth(), t.getDate() + 89)] },
] as const;

function GoalForm({
  goal,
  defaultCurrency,
  onSaved,
  onCancel,
}: {
  goal?: PublicGoal;
  defaultCurrency: string;
  onSaved: () => void | Promise<unknown>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [target, setTarget] = useState(goal ? String(Number(goal.targetAmount)) : "");
  const [currency, setCurrency] = useState(goal?.currency ?? defaultCurrency);
  const [start, setStart] = useState(goal?.startDate ?? localDate());
  const [end, setEnd] = useState(() => goal?.endDate ?? localDate(PRESETS[0].dates(new Date())[1]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api(goal ? `/api/goals/${goal.id}` : "/api/goals", {
            body: { title, targetAmount: Number(target), currency, startDate: start, endDate: end, today: localDate() },
          });
          await onSaved();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}
    >
      <Field label="What are you aiming for?" htmlFor="goal-title">
        <Input
          id="goal-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. November income"
          maxLength={60}
          required
        />
      </Field>
      <div className="grid gap-4 min-[420px]:grid-cols-2 min-[420px]:gap-3">
        <Field label="Target" htmlFor="goal-target">
          <Input
            id="goal-target"
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            required
          />
        </Field>
        <Field label="In" htmlFor="goal-currency">
          <CurrencySelect id="goal-currency" coins value={currency} onChange={setCurrency} />
        </Field>
      </div>
      <div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="goal-start">
            <Input id="goal-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </Field>
          <Field label="Until" htmlFor="goal-end">
            <Input id="goal-end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              variant="secondary"
              size="sm"
              onClick={() => {
                const [a, b] = p.dates(new Date());
                setStart(localDate(a));
                setEnd(localDate(b));
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">Every invoice paid between these dates counts towards the goal.</p>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" loading={busy} disabled={!title.trim() || !(Number(target) > 0)}>
          {goal ? "Save" : "Set goal"}
        </Button>
      </div>
    </form>
  );
}

/** Set, follow, edit and look back on earnings goals. One goal runs at a time. */
export function GoalsCard({
  goals,
  points,
  fx,
  currency,
  onChanged,
}: {
  goals: PublicGoal[];
  points: EarningPoint[];
  fx: Fx | null;
  currency: string;
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const current = currentGoal(goals);
  const past = goals.filter((g) => g !== current);

  async function remove(g: PublicGoal) {
    if (!confirm(`Delete the goal "${g.title}"? Your invoices and earnings are not affected.`)) return;
    setDeleting(g.id);
    setError(null);
    try {
      await api(`/api/goals/${g.id}`, { method: "DELETE" });
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  }

  const saved = async () => {
    await onChanged();
    setEditing(null);
  };

  return (
    <Card className="space-y-4">
      <CardHeader icon="◎" title="Earnings goal" description="Pick a target and a deadline. We track every paid invoice against it." />

      {editing ? (
        <GoalForm
          key={editing}
          goal={goals.find((g) => g.id === editing)}
          defaultCurrency={currency}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      ) : current ? (
        <GoalProgress
          goal={current}
          points={points}
          fx={fx}
          action={
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setEditing(current.id)}>
                Edit
              </Button>
              <Button variant="danger" size="sm" className="min-h-11" loading={deleting === current.id} onClick={() => remove(current)}>
                Delete
              </Button>
            </div>
          }
        />
      ) : (
        <Button block onClick={() => setEditing("new")}>
          Set a goal
        </Button>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {past.length > 0 && !editing && (
        <Disclosure summary={`Past goals (${past.length})`}>
          <ul className="divide-y divide-line">
            {past.map((g) => {
              const p = goalProgress(g, points, fx);
              return (
                <li key={g.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{g.title}</p>
                    <p className="font-mono text-xs text-muted">
                      {shortDate(g.startDate)} – {shortDate(g.endDate, true)}
                    </p>
                    <p className="text-sm tabular-nums">
                      {p.earned === null ? "—" : formatUnit(p.earned, g.currency)}
                      <span className="text-muted"> of {formatUnit(p.target, g.currency)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={p.reached ? "solid" : "muted"}>{p.reached ? "Reached" : "Missed"}</Badge>
                    <TextButton disabled={deleting === g.id} onClick={() => remove(g)}>
                      Delete
                    </TextButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Disclosure>
      )}
    </Card>
  );
}
