import { Kicker } from "@/components/ui";
import { BlankTripLink, TemplateTile } from "@/components/template-tile";
import { STARTER_TYPES, type TripType } from "@/lib/starter-catalog";

/**
 * "Start from a template": one tile per catalog type, each a plain link to
 * `/trip/new?type=<code>`, plus "Blank trip". Shared by `/trips` and the welcome page `/`.
 * Server-renderable: no state, no effects, no data imports; it renders bundled catalog text and
 * counts only. Counts come from the catalog (never literals). Rendered nothing at all, header
 * included, if the catalog is empty.
 *
 * The optional `types` prop exists so tests can supply a different catalog without mocking; no
 * page passes it (a scan test enforces that). The shelf is designed for one row of up to three
 * types: a fourth catalog type needs the grid changed to two columns (architecture.md 17.2).
 */
export function TemplateShelf({
  types = STARTER_TYPES,
}: {
  types?: ReadonlyArray<{ code: TripType; label: string; items: readonly string[] }>;
}) {
  if (types.length === 0) return null;
  return (
    <section aria-labelledby="template-shelf-label">
      <div className="flex items-baseline justify-between px-1">
        <div id="template-shelf-label">
          <Kicker canvas>Start from a template</Kicker>
        </div>
        <BlankTripLink />
      </div>
      <div className="h-2.5" />
      <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2">
        {types.map((type) => (
          <TemplateTile key={type.code} code={type.code} label={type.label} itemCount={type.items.length} />
        ))}
      </div>
    </section>
  );
}
