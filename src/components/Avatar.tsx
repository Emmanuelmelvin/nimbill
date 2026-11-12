import { cx } from "./ui";

/** "Ada Studio" -> "AS", "chidi" -> "C". */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0]?.[0] ?? "?")).toUpperCase();
}

/**
 * A merchant's photo, square with a border to match the rest of NimBill. Without a photo it shows
 * their initials on black, so every board still has a face.
 */
export function Avatar({ src, name, className }: { src: string | null | undefined; name: string; className?: string }) {
  return (
    <span
      className={cx(
        "flex aspect-square shrink-0 items-center justify-center overflow-hidden border border-ink bg-ink font-mono font-bold text-paper",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- already cropped and shrunk on upload, served by our API
        <img src={src} alt={`Photo of ${name}`} className="h-full w-full bg-paper object-cover" />
      ) : (
        <span aria-label={name} className="text-[0.4em] leading-none">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
