"use client";

import { useState } from "react";
import { Badge, type BadgeVariant } from "./feedback";

// A client component because it reads today's date once in the browser; server components can still render it.
const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: "Paid", variant: "solid" },
  unpaid: { label: "Awaiting payment", variant: "outline" },
  overdue: { label: "Overdue", variant: "strong" },
  cancelled: { label: "Cancelled", variant: "muted" },
  expired: { label: "Expired", variant: "muted" },
};

export function StatusBadge({ status, dueDate }: { status: string; dueDate?: string | null }) {
  const [today] = useState(() => new Date().toISOString().slice(0, 10));
  const overdue = status === "unpaid" && dueDate && dueDate < today;
  const s = STATUS[overdue ? "overdue" : status] ?? STATUS.unpaid;
  return (
    <Badge variant={s.variant} className={status === "cancelled" ? "line-through" : undefined}>
      {s.label}
    </Badge>
  );
}
