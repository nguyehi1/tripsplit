/**
 * The "Splitiful" wordmark (requirements.md item 3 / AC4; architecture.md §4 "brand asset
 * pipeline"). **Final artwork, 2026-10-16** — `public/images/wordmark.png`, cropped from the
 * user-supplied final logo (`public/images/splitiful-logo-full.png`, 940×230 native) — the brown
 * logotype with the paw-dot "i", not a text stand-in. Replaces the earlier `font-display` text
 * placeholder entirely.
 */
export function Wordmark({
  width = 112,
  height = 31,
  className = "",
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- no next/image config for public/images/*
    <img
      src="/images/wordmark.png"
      alt="Splitiful"
      width={width}
      height={height}
      className={`block flex-none object-contain ${className}`}
      style={{ width, height }}
    />
  );
}
