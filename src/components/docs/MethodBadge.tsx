import { cx } from "../ui";

/** GET (outlined) or POST (solid). `small` for the sidebar. */
export function MethodBadge({ method, small }: { method: "GET" | "POST"; small?: boolean }) {
  return (
    <span
      className={cx(
        "inline-block shrink-0 border border-ink text-center font-mono font-bold",
        small ? "w-9 py-px text-[9px]" : "w-12 py-0.5 text-[11px]",
        method === "POST" && "bg-ink text-paper",
      )}
    >
      {method}
    </span>
  );
}
