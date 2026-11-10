import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type CardTone = "default" | "strong" | "subtle" | "inverse";
export type CardPadding = "none" | "sm" | "md";

const TONES: Record<CardTone, string> = {
  default: "border border-line bg-paper text-ink",
  strong: "border border-ink bg-paper text-ink",
  subtle: "border border-line bg-subtle text-ink",
  inverse: "border border-ink bg-ink text-paper",
};

const PADDING: Record<CardPadding, string> = { none: "", sm: "p-4", md: "p-5" };

/** Class names for anything that should look like a card (e.g. a link row). */
export function cardStyles({
  tone = "default",
  padding = "md",
  interactive,
  className,
}: { tone?: CardTone; padding?: CardPadding; interactive?: boolean; className?: string } = {}) {
  return cx(TONES[tone], PADDING[padding], interactive && "transition-colors hover:border-ink", className);
}

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "section" | "article" | "div" | "aside";
  tone?: CardTone;
  padding?: CardPadding;
};

export function Card({ as: Tag = "section", tone, padding, className, ...rest }: CardProps) {
  return <Tag className={cardStyles({ tone, padding, className })} {...rest} />;
}

/** Title row for a card: heading, optional description, optional icon and action. */
export function CardHeader({ title, description, icon, action, className }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start gap-3", className)}>
      {icon && (
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center border border-current font-mono text-lg font-bold">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-lg leading-tight font-bold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
