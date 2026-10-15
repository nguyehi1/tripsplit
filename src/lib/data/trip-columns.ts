/**
 * Explicit column lists for reads of `public.trips`, instead of `select("*")`. A star select
 * would hand every member's browser each column the table ever grows, including `other_type`
 * (the typed "Other" trip type, migration 0022), which no screen reads. The lists are `as const`
 * string literals so supabase-js still infers the row type from them.
 *
 * Lives in its own module (not in `trips.ts`) so a test that mocks `@/lib/data/trips` with a
 * factory does not turn these constants into `undefined` for the pages that import them.
 * `other_type` must never be added to either list; a grep test enforces it.
 */

/** What `getMyTrips` and the `/trips` page read for the trip list (`types` picks each row's icon). */
export const TRIP_LIST_COLUMNS =
  "id, name, location, starts_on, ends_on, created_by, completed_at, created_at, types" as const;

/** The list columns plus the invite code the trip dashboard needs. */
export const TRIP_VIEW_COLUMNS =
  "id, name, location, starts_on, ends_on, created_by, completed_at, created_at, types, invite_code" as const;
