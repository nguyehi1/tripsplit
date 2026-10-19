/**
 * The dog-face brand mark (requirements.md item 3 / AC5; architecture.md §4 "brand asset
 * pipeline"). `public/images/dog-face.png` is an alpha-matte cutout of the user-supplied final
 * logo (`public/images/splitiful-logo-full.png`) — transparent background, not a flat white
 * rectangle — so it can be rotated or placed over any backdrop without a visible card edge.
 */
export function DogFace({
  width = 46,
  height = 46,
  className = "",
}: {
  width?: number;
  height?: number;
  /** Rounding/rotation is the caller's call — not baked in here, so it's never fighting an
   *  overriding class. */
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- no next/image config for public/images/*
    <img
      src="/images/dog-face.png"
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      className={`block flex-none object-contain ${className}`}
      style={{ width, height }}
    />
  );
}
