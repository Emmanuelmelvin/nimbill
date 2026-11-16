"use client";
import { useToastStore } from "@/lib/client/toast";
import { withCoins } from "./coins";
import { cx } from "./cx";

// Same look as <Alert>: errors inverted, warnings dashed, so kinds differ without color.
const TOASTS = {
  info: { box: "border-ink bg-paper text-ink", icon: "i" },
  success: { box: "border-ink bg-paper text-ink", icon: "✓" },
  warn: { box: "border-dashed border-ink bg-paper text-ink", icon: "!" },
  error: { box: "border-ink bg-ink text-paper", icon: "✕" },
};

/** Shows the toasts raised with toast() from @/lib/client/toast. Mounted once, in the root layout. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <section
      aria-label="Notifications"
      className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-xl flex-col items-stretch gap-2 px-4 pb-[calc(1rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]"
    >
      {toasts.map((t) => {
        const s = TOASTS[t.kind];
        return (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={cx(
              "toast-in pointer-events-auto flex items-start gap-3 border px-4 py-3 text-sm leading-relaxed shadow-[4px_4px_0_0_var(--color-ink)]",
              s.box,
            )}
          >
            <span
              aria-hidden
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-current font-mono text-xs leading-none font-bold"
            >
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{withCoins(t.title)}</p>
              {t.description && <p className="opacity-80">{withCoins(t.description)}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-mt-1 -mr-2 flex h-7 w-7 shrink-0 items-center justify-center font-mono text-base leading-none opacity-70 hover:opacity-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </section>
  );
}
