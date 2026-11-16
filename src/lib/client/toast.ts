"use client";
import type { ReactNode } from "react";
import { create } from "zustand";
import type { AlertKind } from "@/components/ui/feedback";

// Toast notifications. The list lives in a Zustand store so anything on the client can raise one
// (a component, an event handler, a fetch helper) without passing props or wrapping a provider:
//
//   import { toast } from "@/lib/client/toast";
//   toast.success("Invoice sent");
//   toast.error("Payment failed", { description: "The wallet rejected the transaction." });
//
// <Toaster /> in the root layout shows them.

export type Toast = {
  id: number;
  kind: AlertKind;
  title: ReactNode;
  description?: ReactNode;
  /** Milliseconds before it closes itself; 0 keeps it until dismissed. */
  duration: number;
};

export type ToastOptions = { description?: ReactNode; duration?: number };

/** Errors stay up longer, since they usually need reading. */
const DEFAULT_DURATION: Record<AlertKind, number> = { info: 4000, success: 4000, warn: 6000, error: 8000 };
/** The oldest toasts close first when more than this many are open. */
const MAX_VISIBLE = 3;

type ToastState = {
  toasts: Toast[];
  show: (kind: AlertKind, title: ReactNode, options?: ToastOptions) => number;
  dismiss: (id?: number) => void;
};

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show: (kind, title, options = {}) => {
    const id = nextId++;
    const duration = options.duration ?? DEFAULT_DURATION[kind];
    const toast: Toast = { id, kind, title, description: options.description, duration };
    const toasts = [...get().toasts, toast];
    for (const old of toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE))) clearTimer(old.id);
    set({ toasts: toasts.slice(-MAX_VISIBLE) });
    if (duration > 0)
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), duration),
      );
    return id;
  },
  dismiss: (id) => {
    if (id === undefined) {
      for (const t of get().toasts) clearTimer(t.id);
      set({ toasts: [] });
      return;
    }
    clearTimer(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

const show = (kind: AlertKind) => (title: ReactNode, options?: ToastOptions) => useToastStore.getState().show(kind, title, options);

/** Raise a toast from anywhere on the client. Each call returns its id, for toast.dismiss(id). */
export const toast = Object.assign(show("info"), {
  info: show("info"),
  success: show("success"),
  warn: show("warn"),
  error: show("error"),
  /** Close one toast, or all of them when no id is given. */
  dismiss: (id?: number) => useToastStore.getState().dismiss(id),
});
