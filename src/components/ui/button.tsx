import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import { Spinner } from "./feedback";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";
type StyleProps = { variant?: ButtonVariant; size?: ButtonSize; block?: boolean };

const BASE =
  "inline-flex items-center justify-center gap-2 border text-center leading-snug font-semibold select-none transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "border-ink bg-ink text-paper hover:bg-ink-soft",
  secondary: "border-ink bg-paper text-ink hover:bg-subtle",
  ghost: "border-transparent bg-transparent text-ink hover:bg-subtle",
  // No red in a black & white UI: destructive actions are outlined and invert on hover.
  danger: "border-ink bg-paper text-ink hover:bg-ink hover:text-paper",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-12 px-5 py-2 text-base",
  lg: "min-h-14 px-6 py-2 text-lg",
  icon: "h-11 w-11 shrink-0 p-0",
};

/** Class names for anything that should look like a button. */
export function buttonStyles({ variant = "primary", size = "md", block, className }: StyleProps & { className?: string } = {}) {
  return cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

type ButtonProps = ComponentProps<"button"> &
  StyleProps & {
    /** Shows a spinner and disables the button. */
    loading?: boolean;
    /** Text shown next to the spinner while loading. Without it, only the spinner shows. */
    loadingText?: ReactNode;
  };

export function Button({
  variant,
  size,
  block,
  loading,
  loadingText,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, block, className })}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size="sm" />
          {loadingText ?? <span className="sr-only">Loading</span>}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** An in-app link that looks like a button. */
export function LinkButton({ variant, size, block, className, ...rest }: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonStyles({ variant, size, block, className })} {...rest} />;
}

/** A plain anchor (external URL or deep link) that looks like a button. */
export function AnchorButton({ variant, size, block, className, ...rest }: ComponentProps<"a"> & StyleProps) {
  return <a className={buttonStyles({ variant, size, block, className })} {...rest} />;
}

/** A button that looks like a text link, for low-emphasis actions. */
export function TextButton({ muted = true, className, type = "button", ...rest }: ComponentProps<"button"> & { muted?: boolean }) {
  return (
    <button
      type={type}
      className={cx(
        "min-h-9 text-sm underline decoration-1 underline-offset-4 hover:decoration-2 disabled:opacity-40",
        muted ? "text-muted hover:text-ink" : "text-ink",
        className,
      )}
      {...rest}
    />
  );
}
