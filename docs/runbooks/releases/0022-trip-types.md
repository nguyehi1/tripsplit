# Release migration 0022: trip types

Release checks for migration 0022 (trip types and the typed "Other" type, v0.8.0). Follow these in order.

**Order: apply migration 0022 BEFORE deploying the app.** The trip page selects `trips.types`
(`src/lib/data/trip-columns.ts`), so new code against an unmigrated database fails to load the trip
dashboard. (Old code against the new schema is safe.) Without the migration, trip creation
silently drops the trip type rather than failing.

**The migration that must be applied is the 0022 file containing the FIXED `trips_types_check`**
(duplicate checks written as `(cardinality(types) < 2 or types[1] <> types[2]) and ...`, not
`is distinct from`). A database that still has the first draft of that CHECK rejects a trip with
exactly one (or two) types with a `23514` check violation, and the app shows its generic "Couldn't
create the trip" line. The client fallback is not a workaround and never runs on `23514`. After
applying, create trips with 1, 2 and 3 types, Other only, and Other plus types, and confirm each one
is stored (`select types, other_type from public.trips order by created_at desc limit 5`).

Required before release (not run in CI; none has been executed against a real database yet):

1. Run the live vitest suite `supabase/migrations/0022_trip_types_and_other_type.live.qa.test.ts`
   with the `LIVE_SUPABASE_*` env vars set, against a **non-production** Supabase project if one
   is available. It creates real auth users: use `@example.invalid` addresses and let it clean up.
2. Apply the migration and run `supabase/verify/0022_trip_types_and_other_type.verify.sql` against
   the target database (read-only). Every row must show `ok = true`. Save the output with
   `docs/features/starter-list-exploration/qa-report.md`, and repeat on production after applying
   there and before merging the app change.
3. Confirm after a PostgREST schema reload that both the old 5-argument and new 7-argument
   `create_trip` calls resolve, and that the 7-argument call as `anon` is denied.

## Related

- [Apply a schema change](../../guides/apply-a-schema-change.md)
- [Runbooks](../README.md)

Last verified: 2026-10-20 against 9a951bb
