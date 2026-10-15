# 0014. Trip types: column CHECKs, a no-default `create_trip` overload, and client-side suggestions

Status: accepted
Date: 2026-10-13

Numbering note: this repository has two files numbered 0014. The older [0014-email-invites-pending-member-rows-and-non-credential-tokens.md](0014-email-invites-pending-member-rows-and-non-credential-tokens.md) is superseded (the email-invites design was abandoned). This ADR is the live "0014" and is always referenced by its full filename. The files were not renamed because links in ARCHITECTURE.md, security-constraints.md and architecture.md already point at this filename; renumbering this one to 0016 with `git mv` (and updating those links) is a safe follow-up if the owner prefers it.

## Context

The starter-list feature (0.8.0) stores which kinds of trip an organizer picked (Camping, Airbnb stay, International) and, optionally, a short typed "Other" trip type. Four forces shape how:

- `trips` has a direct INSERT policy (`created_by = auth.uid()`, migration 0001) and anonymous sessions use the `authenticated` role, so validation that lives only in the `create_trip` RPC is bypassable. The Other text is user-typed free text from possibly anonymous users.
- `create_trip` has one live signature. Changing it with `create or replace` creates a second overload; with parameter defaults the old five-named-argument PostgREST call would match both (PGRST203). Migrations and Vercel deploys are not atomic.
- Free text must never reach `types`, and "Other" must not need a marker that can disagree with its text.
- The repo has no direct-Postgres test client, and migration 0013 shipped a column-ambiguity bug that text-shape tests could not catch.

## Decision

1. **Two columns on `trips`:** `types text[] not null default '{}'` and `other_type text null`, each with a named CHECK on the column (`trips_types_check`, `trips_other_type_check`) added in the same migration (0022). The migration is wrapped in an explicit `begin; ... commit;` so a failure leaves no half-applied state (columns without CHECK or grants). The number is the next free one at implementation time; see architecture.md U1. "Other" is represented only by `other_type` being non-null; there is no `other` code in `types`.
2. **Inline CHECK expressions, no validator function.** A helper function in `public` would be an anonymous-callable PostgREST endpoint by default and would need an EXECUTE grant for every role inserting rows. `types` uses array-shape predicates with pairwise `<>` checks guarded by `cardinality(types) < 2 or ...` / `< 3 or ...` (no subquery). Not `is distinct from`: it was used in the first draft and rejected every one- and two-element array, because the missing slots are both NULL and NULL IS DISTINCT FROM NULL is false (found on the first live run). `other_type` uses a locale-independent allowlist of BMP code-point ranges via `\uXXXX` regex escapes, not `[[:alpha:]]` (collation-dependent, can reject combining marks) and not a denylist. Invisible code points inside otherwise accepted ranges (for example U+034F COMBINING GRAPHEME JOINER) are carved out explicitly.
3. **A new seven-argument `create_trip` overload with no parameter defaults**, its own `revoke ... from public`, `revoke ... from anon` and `grant ... to authenticated`. The five-argument function and its grants are untouched. The new body is a self-contained insert (not "call the old one, then update").
4. **Client calls the old signature when nothing was picked, the new one otherwise, and falls back to the old one only on `PGRST202` or `42883`.** Any other error, in particular `23514`, is a failure with fixed generic copy; the thrown error carries only a code. (`42883` can also be raised from inside the new function body; the fallback then silently drops the types but still creates the trip, which is acceptable.)
5. **Suggestions are derived client-side** from the trip's `types` and a bundled TS catalog (`src/lib/starter-catalog.ts`); nothing is stored per suggestion. "+" reuses the existing `shopping_list_items` insert.
6. **No UPDATE path:** no policy, and a table-level `revoke update on public.trips from anon, authenticated` as defense in depth. The verify script also asserts no column-level UPDATE grant exists, since one would survive the table-level revoke.
7. **Release ordering:** migration first (preferably a separate earlier merge), then the app. The production column check is recorded before the app PR merges.

## Alternatives considered

- **Validate in the RPC only.** Bypassed by direct INSERT. Rejected.
- **Revoke direct INSERT on `trips` (as 0001 did for `trip_members`).** Right long-term fix, out of scope, and could break old clients. Recorded as backlog (requirements criterion 66).
- **Put the new arguments on the existing function with defaults.** Creates an ambiguous overload for named calls; old clients and the new client's own fallback would hit PGRST203. Rejected.
- **Set types in a second step after create.** Needs an UPDATE policy or a new RPC (rate limit design). Rejected.
- **A validator function used in the CHECK.** Extra exposed RPC surface and a grant dependency; inline expressions are enough for three codes and one regex. Rejected.
- **`other` as a code in `types` plus a text column.** Creates marker and text mismatch states and loosens the closed set. Rejected on security advice.
- **A separate `trip_custom_types` table with owner-only RLS, or a column-level `revoke select` on `other_type`.** The table conflicts with "stored on the trips row"; the column revoke breaks `select("*")` readers and old clients. The text is member-readable through the API and the privacy page and runbook say so (accepted by the user).
- **Collation-dependent character classes (`[[:alpha:]]`).** Not portable, can reject Vietnamese NFD, Thai and Devanagari marks.
- **A trip-types lookup table.** Overbuilt for three fixed codes; adding a code is one migration that re-adds the CHECK.

## Consequences

- Adding a fourth catalog type needs a catalog entry and a migration re-adding `trips_types_check` (plus an ANALYTICS.md row). Two unit tests catch drift between catalog, migration and analytics docs.
- Tuning the Other-text rule later means a new migration that replaces the CHECK. The same character class string lives in the migration and in `src/lib/validation/trip-type.ts`; a drift test ties them together and reads the class from the newest migration that defines the CHECK.
- The charset is BMP only, which narrows "letters of any script" and blocks emoji by construction. Unassigned code points inside accepted ranges pass the CHECK; the property test reports their count so a Unicode upgrade is visible.
- Between the migration and the app deploy, the schema is ahead of the code and everything works. The reverse order breaks the trip dashboard; ordering is a release rule, not something CI enforces.
- `getTripView` and `/trips` use explicit column lists; `other_type` is never selected by the app in 0.8.0, but any member can read it through PostgREST. No public RPC may add it. `other_type` is documented in a SQL comment header, not `COMMENT ON COLUMN` (PostgREST publishes column comments in its OpenAPI document).
- Trip creation remains unthrottled (direct INSERT bypasses any RPC throttle); the fix is a separate piece of work.
- Future editing (0.8.1) should be a rate-limited `security definer` RPC writing through the same CHECKs, not a column UPDATE grant.
