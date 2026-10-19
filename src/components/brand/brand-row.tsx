import { DogFace } from "@/components/brand/dog-face";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * The brand row — sticker-card dog icon + wordmark, in that order — used everywhere the brand
 * mark appears (Welcome, Home title, Home first-run). Board S (docs/features/redesign-ui/
 * brand-lockup-s.md §1–§2): reuses the pre-redesign Miso sticker card's construction (`card`
 * fill, `10px` radius, `shadow-card-sm`, no border, no tilt) as a persistent icon tile, laid out
 * `flex items-center gap-3` with the wordmark — the same icon-then-text convention as `TripRow`,
 * `TopBar`, and `you-identity-card.tsx`. Two fixed sizes cover every call site (§2's sizing
 * table): `"welcome"` (44px tile / 150×42 wordmark) and `"compact"` (34px tile / 112×31
 * wordmark, used for both the Home title and the Home first-run card).
 */
const SIZES = {
  welcome: { tile: 44, padding: 5, iconWidth: 34, iconHeight: 25, wordmarkWidth: 150, wordmarkHeight: 42 },
  compact: { tile: 34, padding: 4, iconWidth: 26, iconHeight: 19, wordmarkWidth: 112, wordmarkHeight: 31 },
} as const;

export function BrandRow({
  size,
  className = "",
}: {
  size: keyof typeof SIZES;
  className?: string;
}) {
  const { tile, padding, iconWidth, iconHeight, wordmarkWidth, wordmarkHeight } = SIZES[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        aria-hidden
        className="flex flex-none items-center justify-center rounded-[10px] bg-card shadow-card-sm"
        style={{ width: tile, height: tile, padding }}
      >
        <DogFace width={iconWidth} height={iconHeight} />
      </span>
      <Wordmark width={wordmarkWidth} height={wordmarkHeight} />
    </div>
  );
}
