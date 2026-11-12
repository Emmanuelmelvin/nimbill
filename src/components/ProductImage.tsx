import { cx } from "./ui";

/** A product's square picture, or an empty frame with a picture icon when there is none. */
export function ProductImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  return (
    <span className={cx("flex aspect-square shrink-0 items-center justify-center overflow-hidden border border-line bg-subtle", className)}>
      {src ? (
        // Plain <img>: pictures are already shrunk on upload and served from our own API.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <svg
          aria-hidden
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-muted"
        >
          <path d="M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6" />
          <circle cx="16" cy="9" r="1.5" />
        </svg>
      )}
    </span>
  );
}
