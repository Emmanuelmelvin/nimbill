"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatFiat } from "@/lib/currencies";
import type { ProductView } from "@/lib/products";
import { ProductImage } from "./ProductImage";
import { Button, Eyebrow, cx } from "./ui";

/**
 * A product up close, so a buyer knows what they're getting: the picture at full size, the whole
 * description, the price and how many. A sheet that slides up on phones, a window on wider screens.
 * Built on <dialog>, so Escape closes it and focus stays inside while it's open.
 */
export function ProductPreview({
  product,
  merchantName,
  initialQuantity,
  chosen,
  onChoose,
  onClose,
  quantityControl,
}: {
  product: ProductView | null;
  merchantName: string;
  initialQuantity: number;
  /** This product is already the one picked. */
  chosen: boolean;
  onChoose: (quantity: number) => void;
  onClose: () => void;
  /** Renders the quantity picker (shared with the page, so both look the same). */
  quantityControl: (value: number, onChange: (n: number) => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [fit, setFit] = useState<"contain" | "cover">("contain");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (product && !d.open) d.showModal();
    if (!product && d.open) d.close();
  }, [product]);

  const total = product ? Math.round(Number(product.price) * quantity * 100) / 100 : 0;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="preview-title"
      onClose={onClose}
      // Tapping the dimmed area around the sheet closes it.
      onClick={(e) => e.target === dialog.current && dialog.current?.close()}
      className={cx(
        "fixed m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto overscroll-contain border-t border-ink bg-paper p-0 text-ink",
        "sheet-up backdrop:bg-ink/60 sm:m-auto sm:max-w-md sm:border",
      )}
    >
      {product && (
        <div>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-2">
            <Eyebrow>From {merchantName}</Eyebrow>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => dialog.current?.close()} autoFocus>
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Button>
          </div>

          {product.imageUrl ? (
            <figure className="relative border-b border-line bg-subtle">
              {/* Tap to switch between the whole picture and a close-up that fills the frame. */}
              <button
                type="button"
                onClick={() => setFit(fit === "contain" ? "cover" : "contain")}
                aria-label={fit === "contain" ? "Fill the frame" : "Show the whole picture"}
                className="block aspect-square w-full cursor-zoom-in"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- already shrunk on upload, served by our API */}
                <img
                  src={product.imageUrl}
                  alt={`Picture of ${product.name}`}
                  className={cx("h-full w-full", fit === "contain" ? "object-contain" : "object-cover")}
                />
              </button>
              <figcaption className="flex items-center justify-between gap-3 border-t border-line bg-paper px-4 py-2 font-mono text-[11px] text-muted">
                <span>{fit === "contain" ? "Tap the picture to zoom" : "Tap again to see all of it"}</span>
                <a href={product.imageUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-ink">
                  Full size ↗
                </a>
              </figcaption>
            </figure>
          ) : (
            <div className="flex justify-center border-b border-line bg-subtle p-8">
              <ProductImage src={null} alt="" className="w-24 border-0" />
            </div>
          )}

          <div className="space-y-4 p-5">
            <div>
              <h2 id="preview-title" className="text-2xl leading-tight font-bold tracking-tight">
                {product.name}
              </h2>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{formatFiat(product.price, product.currency)}</p>
            </div>
            {product.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted">{product.description}</p>
            ) : (
              <p className="text-sm text-muted">No description.</p>
            )}
            {quantityControl(quantity, setQuantity)}
          </div>

          <div className="sticky bottom-0 space-y-3 border-t border-dashed border-edge bg-subtle p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[11px] tracking-wider text-muted uppercase">
                {quantity > 1 ? `${quantity} × ${product.name}` : "Total"}
              </span>
              <span className="text-xl font-bold tabular-nums">{formatFiat(total, product.currency)}</span>
            </div>
            <Button size="lg" block onClick={() => onChoose(quantity)}>
              {chosen ? "Keep this one" : "Choose this"}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
