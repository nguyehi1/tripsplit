import { STARTER_TYPES, type TripType } from "@/lib/starter-catalog";

export type Suggestion = { name: string; sourceCode: TripType; sourceLabel: string };

/** Case-insensitive, trimmed key used to de-duplicate suggestions against each other and the list. */
export function suggestionKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isTripType(value: unknown): value is TripType {
  return typeof value === "string" && STARTER_TYPES.some((t) => t.code === value);
}
/**
 * Merged, de-duplicated suggestions for a trip's catalog types, minus anything already on the
 * list (any status). Types are walked in the stored pick order, each type's items in catalog
 * order, and the first type to offer a name wins the source label. Derived on every call:
 * nothing is stored per suggestion, so an item deleted from the list reappears.
 */
export function deriveSuggestions(
  types: readonly string[],
  existingDescriptions: readonly string[],
): Suggestion[] {
  const seen = new Set(existingDescriptions.map(suggestionKey));
  const out: Suggestion[] = [];
  for (const code of types) {
    const type = STARTER_TYPES.find((t) => t.code === code);
    if (!type) continue;
    for (const name of type.items) {
      const key = suggestionKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, sourceCode: type.code, sourceLabel: type.label });
    }
  }
  return out;
}

/** "camping", "camping and an Airbnb stay", "camping, an Airbnb stay and international travel". */
export function sentencePhrases(types: readonly string[]): string {
  const phrases = types.flatMap((code) => STARTER_TYPES.find((t) => t.code === code)?.phrase ?? []);
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}

/**
 * Event name for a picked catalog type. Only a code that exists in the catalog produces a name,
 * so a name is never built from free text or unvalidated input.
 */
export function tripTypeSelectedEvent(code: string): string | undefined {
  return isTripType(code) ? `trip_type_selected_${code}` : undefined;
}

/**
 * Event name for a template tile tapped on Home (`/trips` and `/`), fired on the tap, before
 * navigation, with no account. Closed set like `tripTypeSelectedEvent`: only a catalog code
 * yields a name (there is no `home_template_tapped_other`), and the code must come from the
 * bundled catalog, never from the URL or the DOM.
 */
export function homeTemplateTappedEvent(code: string): string | undefined {
  return isTripType(code) ? `home_template_tapped_${code}` : undefined;
}

export const HOME_BLANK_TRIP_EVENT = "home_blank_trip_tapped";

/**
 * Turns the raw `?type=` query value into a catalog code, or `undefined`. Exact and
 * case-sensitive, one string only: no trim, no lowercase, no decoding, and an array (a repeated
 * key) is ignored rather than reduced to its first element. Anything else is simply "no
 * pre-check"; the value is never echoed, logged or forwarded.
 */
export function parseTypeParam(raw: unknown): TripType | undefined {
  return typeof raw === "string" && isTripType(raw) ? raw : undefined;
}

export const TRIP_TYPE_OTHER_EVENT = "trip_type_selected_other";
export const SUGGESTION_ADD_EVENT = "suggestion_add_complete";
