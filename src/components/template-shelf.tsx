import { Kicker } from "@/components/ui";
import { BlankTripTile, TemplateTile } from "@/components/template-tile";
import { STARTER_TYPES, type TripType } from "@/lib/starter-catalog";

/**
 * "Start from a template": the catalog tiles in one row (board A: Camping, Airbnb stay,
 * International), "Blank trip" as its own dashed, full-width row below them (user feedback,
 * 2026-10-16 — not a fourth grid tile). Shared by `/trips` and the welcome page `/`.
 * Server-renderable: no state, no effects, no data imports; it renders bundled catalog text and
 * counts only. Counts come from the catalog (never literals). Rendered nothing at all, header
 * included, if the catalog is empty.
 *
 * The optional `types` prop exists so tests can supply a different catalog without mocking; no
 * page passes it (a scan test enforces that). The grid is a fixed 3 columns, one row, matching
 * today's 3-type catalog; a 4th catalog type needs this reconsidered (architecture.md 17.2).
 */
export function TemplateShelf({
  types = STARTER_TYPES,
}: {
  types?: ReadonlyArray<{ code: TripType; label: string; items: readonly string[] }>;
}) {
  if (types.length === 0) return null;
  return (
    <section aria-labelledby="template-shelf-label">
      <div id="template-shelf-label" className="px-1">
        <Kicker canvas>Start from a template</Kicker>
      </div>
      <div className="h-[14px]" />
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
        {types.map((type) => (
          <TemplateTile key={type.code} code={type.code} label={type.label} itemCount={type.items.length} />
        ))}
      </div>
      <div className="h-2" />
      <BlankTripTile />
    </section>
  );
}
