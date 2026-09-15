# QA report: add-placeholder-members

## Summary

**Overall: PASS.** All 18 acceptance criteria are met. No regressions found
in the identity-key migration (`user_id` -> `trip_members.id`) across
`getTripView`, `getMyTrips`, Details/Summary/settle-up rendering, or
edit-own-expense ownership checks. No gap found in organizer-only,
placeholder-only, or completed-trip-lock enforcement on the three new RPCs,
by static/code-path review (no live Postgres instance was available in this
environment — see "Limitations" below).

13 new tests added (`src/lib/data/trips.placeholder-qa.test.ts`), all
passing, plus the 70 pre-existing tests (83/83 total). `npm run lint` and
`npm run typecheck` both pass clean.

## What was tested

- Read `docs/features/add-placeholder-members/{requirements,architecture,design}.md`
  in full, including the "resolved"/"accepted defaults" sections that
  supersede the open-questions framing earlier in each doc.
- Read `docs/adr/0004-placeholder-member-nullable-user-id-and-identity-key.md`.
- Reviewed `supabase/migrations/0008_add_placeholder_members.sql` line by
  line against `architecture.md`'s spec (identical).
- Reviewed `src/lib/data/trips.ts` (`getTripView`, `getMyTrips`) for the
  `user_id -> trip_members.id` identity translation.
- Reviewed all three UI surfaces: `src/app/trip/[id]/invite/page.tsx`
  (roster/add/rename/remove), `src/app/trip/[id]/page.tsx` (Details/Expenses
  tabs), `src/app/trip/[id]/settle-up/page.tsx`.
- Reviewed `src/lib/avatar.ts`'s `displayNameFor` helper and its four call
  sites.
- Reviewed RLS/grants on `trip_members` (`0001_init.sql`, unchanged by
  `0008`) and `expenses` (`0001_init.sql`, `0005_lock_expenses_when_trip_completed.sql`,
  unchanged by `0008`) to independently verify the payer-restriction
  structural argument in architecture.md §3.
- Ran the existing suite (`npm test`, `npm run lint`, `npm run typecheck`).
- Wrote and ran 13 new tests covering settlement math with placeholders,
  `getMyTrips` (not just `getTripView`) identity-collision regression, and
  the three placeholder RPC client-wrapper functions (param shape + error
  passthrough) — `src/lib/data/trips.placeholder-qa.test.ts`.
- Diffed every file touched in the working tree to separate
  add-placeholder-members changes from the unrelated, concurrently
  in-progress expense-date-month feature (`src/lib/dates.ts`,
  `src/lib/validation/expense.ts`, the date-field additions in
  `add-expense`/edit pages) — confirmed no overlap or interaction bug
  between the two.

## Acceptance criteria: pass/fail

| # | Criterion | Result | Notes |
|---|---|---|---|
| 1 | Only organizer sees "add placeholder" affordance | PASS | `invite/page.tsx`: add/rename/remove UI gated on `isOrganizer` (from `view.you?.isOrganizer`); non-organizers get no add row, no pencil/✕, no cap fraction. Real enforcement is server-side (RPC `created_by = auth.uid()`), so a spoofed client flag can't grant the capability. |
| 2 | Adding requires only a name | PASS | `add_placeholder_member(_trip_id, _display_name)` — no other required input; UI's add form is a single text field. |
| 3 | Max 20 placeholders, 21st rejected with clear message | PASS | RPC counts `where is_placeholder` and raises `"This trip already has 20 placeholders — the most this feature supports. Remove one first."` at count >= 20. UI proactively replaces the add-row with a muted `20/20` message before the user can even attempt a 21st. Verified via code review of the `for update` row lock + count-then-insert sequence (see Limitations re: live concurrency testing). |
| 4 | Duplicate names allowed, no uniqueness check | PASS | RPC never queries `display_name` against existing rows. Verified with a new test (`three placeholders... get their own correct, non-colliding equal share`) using two placeholders with the identical name "Kid A". |
| 5 | "<name> (placeholder)" rendered everywhere a name shows | PASS | Single shared helper `displayNameFor` in `src/lib/avatar.ts`, used at all 4 required sites: payer line on Details/Expenses tab (`page.tsx:247`), Details-tab member list (`page.tsx:270`), roster (`invite/page.tsx:282,348`), settle-up transfer list (`settle-up/page.tsx:137-138,218-219`). Not baked into raw `displayName` — confirmed `initialsFor`/rename flows use unadorned name. |
| 6 | Any member (not just organizer) can see placeholders | PASS | `trip_members` `select` RLS policy (`0001_init.sql`, unchanged) is `is_trip_member(trip_id)` — any real member, no organizer restriction. `invite/page.tsx`'s Placeholders section renders for all members when `placeholders.length > 0`; only the add/rename/remove affordances are organizer-gated. |
| 7 | Placeholder can never be selected as payer in a picker | PASS (N/A by design) | No payer picker exists anywhere in the app (`add-expense`/edit both hard-code `paidBy: user.id`) — confirmed by grep; forward-looking AC is satisfied vacuously per requirements' own framing. |
| 8 | Payer restriction enforced server-side, not just UI | PASS | Verified independently (not just trusting architecture.md's claim): `expenses.paid_by` is `not null references auth.users(id)` and a placeholder has no `auth.users` row ever (categorically, not just today); independently, the `"members can add expenses"` insert policy's `exists (... where user_id = expenses.paid_by)` can never match a placeholder since its `user_id` is `null` and `null = x` is never true in SQL. Two independent structural blocks, neither touched by migration 0008. |
| 9 | Placeholder = 1 full share, $0 paid, owes full share | PASS | New test: single placeholder in a 2-person, $100 trip gets `paidCents: 0`, `shareCents: 5000`, `netCents: -5000`; settlement direction confirmed placeholder is always `from`, never `to`. `settlement.ts` itself required (and received) no changes. |
| 10 | Organizer can rename a placeholder, reflected everywhere immediately | PASS | `rename_placeholder_member` updates `display_name` in place; UI refetches (`refresh()`) after success and every display site reads the same `display_name` column, so no separate propagation step is needed. |
| 11 | Only organizer removes; only placeholders removable | PASS | `remove_placeholder_member`'s delete is scoped by `t.created_by = auth.uid() and m.is_placeholder` in the same statement — a non-organizer's call or an attempt against a real member's row both fail the `WHERE` and surface as `not found`, indistinguishable from a bad id. No capability to remove a real member is exposed even accidentally. |
| 12 | Remove is a plain immediate delete, always safe | PASS | RPC is a direct `delete`; no expense can ever reference a placeholder as `paid_by` (#7/#8), so there's nothing to orphan. |
| 13 | Removing a placeholder immediately/retroactively corrects remaining shares | PASS | New test (`removing a placeholder... immediately recomputes the remaining members' shares`): a 3-member ($90) trip's `shareCents` for a real member goes from 3000 (÷3) to 4500 (÷2) once the placeholder row is gone from the next `getTripView` call — confirms live recomputation, no stored/stale split. |
| 14/15 | No auto-claim/merge; double-counting until manually removed is accepted | PASS (documented, not a bug) | No matching/merge logic exists anywhere in the diff. Roster UI shows a static per-placeholder reminder line to the organizer ("Remove this once {name} joins for real…"), matching design.md §5. |
| 16 | Invite link / `/join/[code]` / `join_trip` unchanged | PASS | `join_trip` RPC (`0001_init.sql`) untouched by migration `0008`; still always inserts a real, non-null `user_id`. `src/app/api/join/route.ts` and its test are untouched by this feature's diff and don't reference `trip_members.id`/placeholder concepts at all. |
| 17 | All 3 RPCs reject on a completed trip | PASS | Each of `add_placeholder_member`/`rename_placeholder_member`/`remove_placeholder_member` in `0008_add_placeholder_members.sql` includes `public.is_trip_open(...)` in its gating condition (add: inside the organizer-check `exists`; rename/remove: `and public.is_trip_open(t.id)` in the same `update`/`delete` `WHERE`), mirroring `0005_lock_expenses_when_trip_completed.sql`'s pattern exactly. Rejects with a clear message rather than a silent no-op. |
| 18 | UI reflects the completed-trip lock, not just server-side rejection | PASS | `invite/page.tsx`: `locked = view.trip.isCompleted`; when true, pencil/✕/add-row are all hidden and replaced with the same terracotta locked-state banner pattern used on `add-expense` ("This trip is locked — the organizer already settled it up, so the roster can't be changed."). Both UI and RPC enforcement independently verified — this was explicitly checked as "not just one or the other" per the task brief. |

**18/18 acceptance criteria PASS.**

## Regression check (architecture.md's impact analysis, consumer by consumer)

| Consumer | Result | Notes |
|---|---|---|
| `is_trip_member(_trip_id)` | PASS | Filters `user_id = auth.uid()`; `auth.uid()` is never null for an authenticated caller, so a placeholder row can never match, regardless of nullability — confirmed unchanged in `0001_init.sql`, not touched by `0008`. |
| `get_trip_by_invite_code` | PASS | Joins on `user_id = t.created_by`, never null — unaffected. |
| `create_trip` / `join_trip` | PASS | Both always insert a real, non-null `user_id`; both still succeed unchanged against the loosened schema (verified: no change in `0008` to these functions, and the check constraint's not-placeholder branch is satisfied by any real, non-null `user_id`). |
| `getTripView` — trip with zero placeholders | PASS | New regression test confirms `isPlaceholder === false` for all members, correct `you`/settlement resolution, unaffected by the identity-key switch. |
| `getMyTrips` — trip with zero placeholders | PASS | New regression test confirms unaffected `yourNetCents` computation for a real-members-only trip. |
| `getMyTrips` — trip with placeholders | PASS | This consumer is **not** covered by the engineer's own tests (`trips.test.ts` only added coverage for `getTripView`) — added new coverage here myself. Confirmed multiple placeholders get distinct `id`s and don't collapse the `Map`-based balance lookup (the exact bug ADR 0004 flags), and `yourNetCents` for the real organizer computes correctly. |
| Details tab / Expenses tab (`src/app/trip/[id]/page.tsx`) | PASS | `editable = expense.payer.id === you?.id` — both sides now consistently `trip_members.id`-typed post-migration; no comparison of old vs. new identity styles found. |
| Edit-own-expense ownership check (`.../edit/page.tsx`) | PASS | Confirmed (per ADR 0004's own consequence note) this file compares `expenseResult.data.paid_by !== user.id` — a raw DB column vs. raw session id, bypassing `trips.ts`'s shaping entirely — so it's structurally unaffected by the identity-key change. Verified by reading the file directly rather than trusting the ADR's claim. |
| Settle-up for a trip with zero placeholders | PASS | `members.some((m) => m.isPlaceholder)` correctly gates the placeholder-specific clarifying copy off; existing transfer list/complete-trip flow unchanged. |
| `AvatarStack` / React list keys (`src/components/ui.tsx`, `invite/page.tsx`, `page.tsx`) | PASS | All key off `member.id`, now always the unique `trip_members.id` — no duplicate/null-key risk with 2+ placeholders (previously a real risk under the old `user_id`-as-key scheme, per ADR 0004). |
| `expenses` RLS (`insert`/`update`/`delete`) | PASS | None of the three policies were touched by migration `0008`; independently re-verified the `insert` policy's `exists` check can never match a placeholder (see AC8 above). |
| `trip_members` RLS/grants | PASS | No new `insert`/`update`/`delete` policy added; `revoke insert ... from authenticated` (pre-existing, `0001_init.sql`) still stands, so the three new RPCs remain the only write path, exactly as architecture.md claims. |
| Migration ordering / deploy-race safety | PASS (by inspection) | Old app code's `create_trip`/`join_trip` inserts (real `user_id`, no `is_placeholder` mention) still satisfy the new check constraint (`is_placeholder` defaults `false`, real `user_id` present) — reviewed the constraint logic directly rather than trusting the doc's claim. |
| Migration reversibility | Informational, not a blocker | No down-migration convention exists anywhere in this project (0001-0008 all lack one), so `0008` is consistent with prior practice. A manual rollback of `0008` (dropping `is_placeholder`, restoring `user_id not null`) would fail if any placeholder rows exist at rollback time (`user_id` would need backfilling first) — an inherent property of this being a genuinely additive/nullable-loosening migration, not a defect introduced by this feature. |

No regressions found.

## Edge cases covered (new tests)

1. Single placeholder in a 2-person trip: exact $0-paid / full-share / negative-net assertions, plus settlement direction (placeholder always `from`, never `to`).
2. Three placeholders (two with an identical duplicate name) on one $400/4-way-even-split trip: each gets an independent, correct `paidCents`/`shareCents`/`netCents`; verified via `Set` that all three `id`s and resulting settlement `from` sides are distinct (directly exercises the null-user_id collision bug ADR 0004 describes).
3. Live recomputation on removal: shows a 3-person trip's real member share moving from $30.00 (÷3) to $45.00 (÷2) once a placeholder is gone, without any stored-split reconciliation step.
4. Zero-placeholder regression on both `getTripView` and `getMyTrips`.
5. `getMyTrips` with 2 placeholders on the same trip — this exact function had no placeholder-specific coverage from the engineer; added it since architecture.md explicitly calls out `getMyTrips` as one of the two places needing the identity-key fix.
6. All three RPC client-wrapper functions (`addPlaceholderMember`, `renamePlaceholderMember`, `removePlaceholderMember`): correct param shape sent to `supabase.rpc(...)`, and backend errors (cap-exceeded, organizer/lock rejection, not-found-or-not-organizer-or-locked) are rethrown untouched rather than swallowed or reworded — this is what lets the UI's existing `e instanceof Error ? e.message : ...` fallback surface the backend's real rejection reason.

## Full suite results

- `npm test`: **83/83 passed** (70 pre-existing + 13 new in `src/lib/data/trips.placeholder-qa.test.ts`).
- `npm run lint`: **clean**, no errors/warnings.
- `npm run typecheck`: **clean**, no errors.

## Limitations / what could not be verified in this environment

- **No live Postgres/Supabase instance was available** (no `supabase` CLI, no Docker) to actually execute `add_placeholder_member`/`rename_placeholder_member`/`remove_placeholder_member` against a real database, so organizer-only/placeholder-only/cap/lock enforcement was verified by careful static reading of the SQL (cross-checked line-by-line against `architecture.md`'s spec and the pre-existing `complete_trip`/expense-lock patterns it claims to mirror) plus new unit tests around the TypeScript RPC-wrapper layer, not by driving the RPCs themselves end-to-end. In particular, the 20-cap's concurrency claim (the `for update` row lock serializing two overlapping `add_placeholder_member` calls) is architecturally sound on inspection but was not exercised under actual concurrent connections.
- No component/DOM-level test (e.g. Testing Library) exists in this repo for any page today, so the UI-lock-state review (AC #18, organizer-gating) was done by code reading rather than a rendered-component test, consistent with the project's existing testing conventions (all current tests are data/logic-layer only).

## Files touched by this QA pass

- Added: `/Users/hiennguyen/Desktop/10. TripSplit/src/lib/data/trips.placeholder-qa.test.ts` (new tests only, no implementation changes)
- Added: `/Users/hiennguyen/Desktop/10. TripSplit/docs/features/add-placeholder-members/qa-report.md` (this report)
