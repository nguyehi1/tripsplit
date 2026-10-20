# Performance

The rules that keep reads fast, and the current state of the known latency costs. Measurements and review evidence are in the [October 2026 performance review](../reviews/performance-review-2026-10.md).

## Rules for reads

| Rule | Detail |
|---|---|
| Run independent calls concurrently | `/trips` runs its own `getUser()` in parallel with the `trips` select. `/trip/[id]` runs `getUser()` and `getTripSummary()` together before conditionally awaiting `getTripView()`. |
| Pass fetched data forward | `getMyTrips(supabase, userId, prefetchedTripRows?)` and `requireVerifiedSession(supabase, prefetchedUser?)` accept values the caller already has. Omitting them keeps the plain behavior. |
| Use explicit column lists | `trips` is never read with `select("*")`. Use `src/lib/data/trip-columns.ts`. This is also a privacy rule: `other_type` is never selected. |
| Don't re-fetch in a client effect what the server already knows | The add-expense sheet's mount-time gating fetch is a known exception ([Rendering](rendering.md#mount-time-fetch-in-the-add-expense-sheet)). |
| Don't race a rate limiter against the call it gates | It changes when the Postgres-side bucket fills. |
| Compute on the server over small arrays | `computeBalances` and `simplifyDebts` (`src/lib/settlement.ts`) run server-side over per-trip data. No caching needed at this size. |

## RLS and indexing

An RLS policy is evaluated for every row the planner cannot exclude first, so its cost can grow with table size instead of with the caller's data.

- The `trips` select policy uses `id in (select public.my_trip_ids()) or created_by = (select auth.uid())`. `my_trip_ids()` is a `security definer` helper that returns the caller's trip ids once, so the planner hashes them. Writing `is_trip_member(id)` there instead forces a per-row function call and a sequential scan across every trip in the app. An index on `trips (created_by)` does not fix it.
- `trip_members (user_id)` backs `my_trip_ids()`.
- Per-trip tables (`expenses`, `trip_members`, `shopping_list_items`) are indexed on the column they filter by. `shopping_list_items` is the best-indexed shape in the schema: `(trip_id, status)` plus partial indexes on `claimed_by`, `added_by` and `expense_id`.
- There is no index with `paid_by` or `user_id` as a leading column on `expenses` or `trip_members`. A feature that needs "every expense a user paid" or "every trip a user belongs to" as its own query must add one.

When writing a policy, test it against a large synthetic table, not only the small dev database.

## Known costs

| Cost | State | Where tracked |
|---|---|---|
| `/trips` pays two sequential Auth-server round trips (proxy, then page) | Accepted. The proposed fix waits on timing data. | [ADR 0011](../adr/0011-forward-verified-user-id-header-for-trips-page.md) |
| Add-expense sheet mount-time fetch waterfall | Open, not scoped | [Roadmap](../product/roadmap.md) |
| Per-call durations are dominated by Vercel-to-Supabase network time | Infrastructure and region colocation, not a code fix | [Review](../reviews/performance-review-2026-10.md) |

## Why

The costs that mattered were round trips and RLS evaluation, not query execution, so the rules target sequencing and policy shape.

## Related

- [Telemetry](telemetry.md)
- [Data model](../reference/data-model.md)
- [ADR 0010](../adr/0010-interim-per-call-timing-instrumentation.md), [ADR 0011](../adr/0011-forward-verified-user-id-header-for-trips-page.md)

Last verified: 2026-10-20 against 9a951bb
