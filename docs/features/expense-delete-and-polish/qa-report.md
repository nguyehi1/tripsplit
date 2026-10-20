# QA report: expense-delete-and-polish

Stage 8 (QA). Date: 2026-10-19. Tested the uncommitted working tree against requirements.md (41 criteria),
architecture.md (sections 8 and 10), design.md (sections 8, 13, 14) and the Design review sections of the
security and compliance constraints. Nothing was run against the live database or the `.env.local` project; no
product code was changed.

## Verdict

**PASS with open items.** No implementation defect found. Every database criterion was proven on a real Postgres
(10.5, scratch, own port, own data dir). Open items, none of them code defects:

1. Runbook `docs/runbooks/account-deletion-and-export.md` is not yet updated (criterion 31 text, compliance D2).
   Docs stage; must land before ship.
2. Release gate G1: `pg_cron` on the live project and the `erase-expired-expenses` job are unverified (cannot be
   checked from here). Without it "erased within about 2 minutes" is not true on an idle deployment.
3. UI pixel measurements at 390px and 320px and the visual toast position were NOT verified in a browser (see
   "Unverified").

## Results of the suite runs

| Check | Result |
|---|---|
| `npm test` (full, after adding my tests) | PASS: 88 files passed, 1 skipped (live 0022 test, env-gated); 752 tests passed, 60 skipped |
| `npm test` (full, before adding my tests, engineer's tree) | PASS: 84 files, 712 tests |
| `npm run lint` | PASS: 0 errors, 1 pre-existing warning (`src/lib/supabase/service.test.ts` unused `_args`, file untouched). New test files lint clean |
| `npm run typecheck` | PASS for `src/`. The only errors are the 4 pre-existing duplicate `.next/**/* 3.ts` files (ignored as instructed) |
| `npm run perf:bench` | PASS (no regression; baseline not regenerated, this feature changes none of the three functions) |

Perf table (verbatim), against `src/lib/perf/local-baseline.json`:

```
name             p50 (ms)  p95 (ms)  mean (ms)  n
getMyTrips       62.508    187.282   69.673     50
getTripView      67.844    116.701   73.906     50
getTripSummary   0.194     99.066    25.710     50
```

p95 vs baseline: getMyTrips 0.87x, getTripView 0.84x, getTripSummary 1.16x (baseline 85.6). All under the 1.5x WARN
line: PASS. Note: synthetic in-process bench, not live latency. The only SQL on these paths that changed is the
`deleted_at is null` term in the read policy and `get_trip_summary`, which this bench does not exercise.

## Scratch Postgres method

- PostgreSQL 10.5 (`/usr/local/bin`), `initdb` in the scratchpad, Unix socket only, port 54412 (never 3000), killed
  nothing I did not start.
- Stubbed `auth` schema (`auth.uid()` and `auth.jwt()` driven by `test.uid`/`test.anon` settings, `auth.users` with
  `is_anonymous`, `email`, `refresh_tokens`), a `storage` stub, roles `anon`, `authenticated`, `service_role`,
  and Supabase default ACLs (`alter default privileges ... grant execute on functions` and `grant all on tables` to the
  three roles) set BEFORE any migration.
- **Fidelity: migrations 0001 to 0023 were applied for real, in order, with no hand-built state.** The only change
  was a copy of two trigger lines (0015 and 0020) rewritten `execute function` to `execute procedure` for PG10
  (PG11 syntax). Everything else is byte-for-byte the repo's files. The pre-0024 state therefore carries the real
  0009 policies, 0014 trigger, 0015 shopping list, 0021 revokes and 0023 trips policy.
- Seeded 7 expenses before 0024 (linked to items, plain, other trip, locked trip, removed-member payer, item whose
  claimer was removed), 2 trips plus one locked, an anonymous-session member and a placeholder.
- 0024 applied twice on a populated database: both runs exit 0, second run only prints "already exists, skipping"
  notices, seeded rows survive. Test scripts are saved in `qa-sql/` next to this report (all psql, each test on a
  fresh `create database ... template` copy).

## Acceptance criteria, one by one

Legend: PASS = verified with evidence; PASS (code) = verified by reading code and unit/jsdom tests, not in a
browser; OPEN = depends on a later stage or live environment.

| # | Result | Evidence |
|---|---|---|
| 1 Delete control only on own expense | PASS (code) | New jsdom test `edit-expense-sheet-content.delete.qa.test.tsx`: payer on open trip sees Delete + caption; non-payer and payer-on-locked see none (hidden, not disabled). Entry only via edit sheet (pencil already only on own rows). |
| 2 Immediate removal, Undo for about 10 s | PASS (code) | Delete wrapper then `router.push` + `router.refresh`; toast test: shows "Expense deleted" + Undo, gone after 10 s (`expense-undo-provider.qa.test.tsx`). DB: hidden from owner and other member reads immediately (psql). |
| 3 Undo restores unchanged | PASS | psql: Undo at 14.9 s restores row; amount, description, paid_by, trip_id identical; both linked items re-linked to `logged`. |
| 4 Undo only way back, erase for good | PASS | After erase the row is physically gone (`exists=false`); no restore function, no list, no table-level DELETE for clients. |
| 5 Undo fails plain, changes nothing, after window/erase | PASS | psql: at 15.1 s, after erase, live row, nonexistent id: all `EX002 expense_undo_unavailable`, state unchanged. UI: one "too late" line, list refreshed (jsdom). |
| 6 Excluded from every read; Undo puts back | PASS | psql: `a_sees_x1=0`, `b_sees_x1=0`, trip row count 5 to 4; `get_trip_summary` total 5900 and Alice's paid 1700 exclude the marked 2000, members with no live expenses (Cara, Pat) still listed with share 1475. TS reads are plain `from("expenses")` through the RLS policy (guard test pins them). Undo restores. |
| 7 Locked: no control, Undo refused | PASS | UI test (no Delete on locked); psql: delete on locked trip EX001; delete then lock then Undo: EX002; hidden row stays hidden. |
| 8 Delete reverts linked items atomically | PASS | psql: 2 items back to `claimed` by the same member, `expense_id` null, marker set; removed-claimer item (claimed_by null) goes to `open`. Shape check never violated. |
| 9 Undo re-links only still-matching items | PASS | psql: unclaim+reclaim by same member clears marker, not re-linked; other member's claim: not re-linked; item left alone silently; removed claimer item stays `open`, marker cleared. Two-session race: Undo racing an uncommitted unclaim re-evaluates after the commit and re-links only the untouched item. |
| 10 No notification / label | PASS | No trigger on `expenses` or `shopping_list_items`; `pg_publication` has no publications and `pg_publication_tables` is empty for both tables; no UI string beyond the toast. |
| 11 Deleted expense cannot be opened | PASS (code) | RLS returns zero rows (PGRST116 path); jsdom test: "This expense isn't available anymore." + Back to trip, no Try again, no contents; network error keeps the old retry line. |
| 12 Other expenses untouched; paid_by/trip_id unchanged | PASS | psql: exactly one row marked per delete; paid_by and trip_id compared after Undo. |
| 13 Plain errors, raw never shown/logged | PASS | Unit tests (engineer's + mine): `ExpenseActionError` carries only a code; a raw rejection with secret text never reaches the DOM; no `console.*` in the new paths; `timeClient` rethrows without logging. |
| 14 Add/edit otherwise unchanged | PASS | Full suite green incl. existing add/edit tests. psql: insert as payer with `paid_by = self` works and `deleted_at` stays null; `add_expense_and_log_shopping_items` links claimed items and returns the row; edit of amount/description/date on own live row works. |
| 15 Departed payer: fails closed | PASS | psql: expense of removed payer (X4): deleted by payer-not-member EX001, by another member EX001; stays counted in `get_trip_summary` total. |
| 16 Delete RPC hygiene | PASS | psql: SECURITY DEFINER, `search_path = public, pg_temp`, 1 arg 0 defaults; execute false for anon and public, true for authenticated; non-payer, other member, non-member, anonymous-session, no-uid, anon role, locked trip, departed payer all fail with the one fixed `EX001 expense_not_available`; second delete does not rewrite `deleted_at` (equality check). |
| 17 Undo RPC | PASS | Same hygiene; non-payer, non-member, live row, nonexistent id, anon role, locked trip, window passed, erased: single `EX002`; trip-open re-check after lock proven by two-session test below. |
| 18 DB-clock window, three numbers, races | PASS | Numbers: toast 10 s (client), Undo accepted until +15 s, erase from +30 s (~90 s with cron). Boundary: 14.9 s accepted, 15.1 s refused. Two sessions: Undo waiting on a row lock held by an erase-like session (1) finds the row gone and gets EX002; (2) acceptance is judged at lock acquisition: a row 14 s old whose lock wait pushes it past 15 s is refused. Double Undo: second EX002. Delete-Undo-delete: second delete gets a fresh mark (<2 s old), never extends a hidden row. |
| 19 Hiding independent of erase | PASS | Row marked 29 s or 60 s back is hidden by the read policy before erase runs; static guard test (`expenses-read-guard.test.ts`) passes; `get_trip_summary` filters itself (in `total` and the LEFT JOIN ON). |
| 20 Two erase layers, cron-absent path | PASS | Cron absent (real run): migration prints the NOTICE and succeeds; opportunistic batch alone erased a 60 s-old row on the next delete. Cron present path (stub `cron` schema, guard flipped on the DO block): one job `erase-expired-expenses`, `* * * * *`, re-run does not duplicate; a throwing `cron.schedule` is swallowed with a NOTICE and the script exits 0. Runbook check query: OPEN (item 1). |
| 21 Erase predicate; never a live/in-window/other-trip row | PASS | `has_function_privilege` false for anon, authenticated and public on `erase_expired_expenses`, `erase_expired_expenses_batch` and both interval helpers; calling them as authenticated or anon: permission denied. As owner/service_role the function takes no argument: live rows, a 29 s row, and rows of other trips are never deleted; a 31 s and a 40 s row (including a locked-trip row) are erased; list-item references are cleared in the same run. SKIP LOCKED proven in two sessions: a row locked by another session returns 0 and survives, then is erased after release. The optional wrapper was not built (permitted). Note: `service_role` keeps execute through Supabase default ACLs (expected, server-only key). |
| 22 No client DELETE; cascade and purge work | PASS | Policy set has zero delete policies and table DELETE revoked: direct DELETE as payer, other member, non-member and anon role all `permission denied`. Trip cascade removes marked rows too (trip without list items). 0018 purge skips an old anonymous user holding an in-window row (0 purged) and removes them after erase. |
| 23 Mark and ownership unwritable | PASS | As `authenticated`: UPDATE of `deleted_at`, `paid_by`, `trip_id` all `permission denied` (column grants amount, description, date only; back-dating attempt included); update of a marked row affects 0 rows; other member's row 0 rows; locked trip row 0 rows; own live row amount/description/date updates. |
| 24 Insert pinned to caller | PASS | Insert with another `paid_by`: RLS violation; with `deleted_at` set: RLS violation; own: ok with `deleted_at` null; locked trip and anonymous session: violation. |
| 25 Marker column | PASS | Nullable FK `on delete set null`, partial index; set by delete; cleared on Undo for all referencing rows, on erase, on claim and unclaim. Member-removal trigger retested with the new column: claimer removed while an item holds a marker, item goes to `open`; shape check never fails. |
| 26 One transaction per action; lock inside window | PASS | Lock mid-window: Undo refused, row stays hidden, erase still completes, live rows of the locked trip untouched (4 of 4). Two-session: delete vs `complete_trip` serialize both ways (delete waits then EX001 when lock commits first; lock waits for an in-flight delete and Undo is then refused). |
| 27 One migration, additive, idempotent, populated tables | PASS | Single file `0024`. Applied twice to a database already carrying 0001 to 0023 and seeded rows (open/locked trips, removed-member payer, linked items). Exact policy set after: 3 policies, names and predicate text as architecture. Old-code/new-schema: old edit/add statements pass. New-code/old-schema: PGRST202/42883 mapped to "unavailable" (unit-tested), no `.delete()` fallback anywhere (`from("expenses")` sites pinned by guard). Reversibility: forward-only by design (erase is irreversible); columns and policies could be reverted by hand, no down script exists. Rollback plan in architecture is "redeploy previous build, schema stays". |
| 28 Rate limit on the real path | PASS | psql: 20 delete/undo calls succeed, the 21st raises `rate limited: try again shortly`; one shared bucket per user and trip; failed probes roll back their increment. |
| 29 No trigger/realtime/webhook leak | PASS (this DB) | No non-internal triggers on `expenses` or `shopping_list_items`; no publications on the scratch DB. The live `supabase_realtime` publication is a release-checklist item and cannot be checked here. |
| 30 `deleted_at` timestamp only | PASS | Only that column and the nullable uuid marker added; no who/text column. |
| 31 Retention, runbook | PARTIAL / OPEN | No `/privacy` or `LEGAL_LAST_UPDATED` change (correct). Account deletion with an in-window payer fails on the FK until erase, succeeds after erase, no orphan (psql). Purge skips then succeeds (see 22). Runbook file is untouched: the three required additions (note, overdue-rows query, wait-or-run-erase step) are still to write. |
| 32 UI copy facts only | PASS | Copy table matches design; test greps toast copy for backup, "all systems", "only you", "forever" and "permanently": none. Caption is true because Undo really fails afterwards. |
| 33 Analytics names only | PASS | `expense_delete_complete` and `expense_undo_complete` with no properties (tests assert the call has exactly one argument); both listed in `docs/ANALYTICS.md`; architecture section 6 already corrected to these names. |
| 34 Recorded constraint M1 | PASS | Present in architecture section 12, ADR 0017 and `compliance-baseline.md`. |
| 35 Settle-up locked footer | PASS | New jsdom test: no "Trip completed" button, "Create a new trip" kept and routes to `/trip/new`, status card and Locked badge remain, nothing disabled in the footer. |
| 36 Open trip unchanged; repeat lock no-op | PASS | jsdom: open trip still has "Trip complete", no "Create a new trip". psql: second `complete_trip` leaves `completed_at` unchanged. |
| 37 Invite 11px | PASS (code) | Source test: exactly two `p-[11px_18px]` cards (members and placeholders); remaining 14px sites are not member rows. Pixel result unverified in a browser. |
| 38 You row | PASS | SSR test: third row after Terms, one `href="/feedback"`, no query, same `py-[11px]`/36px tile/chevron recipe, no user data. |
| 39 Trip details keeps feedback | PASS (code) | Source test: `title="Send feedback"` and `href="/feedback"` still in `trip/[id]/page.tsx`. |
| 40 Trips/home no feedback | PASS | Engineer's updated test plus my source test (no `/feedback`, no "Send feedback", icon import gone). |
| 41 Feedback otherwise unchanged | PASS | No diff to `src/app/feedback/**`; proxy and return destination untouched. |

## Regression checks (consumers from architecture section 7)

| Consumer | Result |
|---|---|
| `getTripView`, `getMyTrips`, `addExpense`, `updateExpense`, edit read | Unchanged TS; all go through the new read/insert/update policies; verified by SQL as `authenticated` and by the full suite |
| `get_trip_summary` | Same signature and return table; grants unchanged after 0024 (anon and authenticated false, service_role true); `create or replace` only |
| `claim_/unclaim_shopping_list_item` | Grants identical before and after (anon, authenticated, service_role execute); behaviour unchanged except the marker clear; exercised through delete/Undo scenarios |
| `add_expense_and_log_shopping_items` | Works, never sets `deleted_at`, items linked (psql) |
| `release_shopping_list_claims_on_member_removal` trigger | Retested with marker present |
| `was_removed_from_trip`, 0018 purge | Count an in-window row (harmless, as designed); purge skips then succeeds |
| Settle-up, Invite, You, Trips/home, trip details | Covered in 35 to 41; full suite green |
| Shopping-list tab | Only the shared bottom constant changed (`bottom-[106px]`, same value) |
| Trip layout | Provider renders no wrapper element; `TripSheetChrome` tests pass |
| Policies | Exact set via `pg_policies`: one select, one insert, one update, zero delete |

## Tests added by QA (test files only)

- `src/app/trip/[id]/edit-expense-sheet-content.delete.qa.test.tsx` (14 tests): control visibility, in-flight
  disabling, one neutral error for every code, raw error never shown, unverified redirect, not-found state.
- `src/app/trip/[id]/expense-undo-provider.qa.test.tsx` (17 tests): 10 s timer, every Undo message and state,
  no double Undo, single toast replacement, hidden off the trip page with deadline kept, name-only analytics,
  always-present status region, copy rules.
- `src/app/trip/[id]/settle-up/page.locked-footer.qa.test.tsx` (3 tests).
- `src/app/polish.you-invite-feedback.qa.test.tsx` (6 tests).
- Real-Postgres scripts are kept as psql files in `docs/features/expense-delete-and-polish/qa-sql/` (not wired into
  `npm test`, which has no Postgres; re-run notes: create DB, `boot.sql`, `stor.sql`, migrations 0001 to 0023, `seed.sql`,
  0024 twice, then each `t_*.sql`/`r*_*.sql`; the two-session scripts are run as `rN_s1` in the background and
  `rN_s2` in the foreground).

## Findings and observations (no blocking defects)

1. **Open, docs stage:** runbook update not written (criterion 31, compliance D2). Medium until written, because the
   overdue-rows check and the account-deletion step are what back the 24 h cap.
2. **Open, release gate G1:** `pg_cron` on live unverified; the migration only prints a NOTICE when it is absent.
3. **Observation, pre-existing, not caused by 0024:** on this PG10 scratch database, deleting a whole trip that has
   shopping-list items fails (`shopping_list_items_trip_id_fkey` during the member-removal trigger) in the
   pre-0024 state too. Likely PG10 cascade ordering, unconfirmed on PG15; trip cascade for expenses was verified on a
   trip without list items. Worth a separate look but out of scope.
4. **Observation:** Supabase default ACLs leave `TRUNCATE` (which ignores RLS) granted to anon/authenticated on every
   table, `expenses` included. Not reachable through PostgREST, pre-existing and project-wide; mention only.
5. **Behaviour note (by design):** the trip creator counts as a verified member in `is_verified_trip_member`, so a
   creator who is removed from `trip_members` can still delete their own expense; the "member removed between
   checks" race was therefore proven with a non-creator payer (fails EX001 as required).
6. Design A2 (single toast replaces the previous) was built as the design says; the older expense can no longer
   be undone from the screen although the database would still accept Undo until +15 s. Product call, tested.

## Unverified (plainly)

- Browser rendering. A dev build needs the live Supabase env, which I may not use, so I did not run the UI. Not
  verified: the 390px/320px measurements in design.md section 8 (Delete button 350/280 x 48, caption wrapping, error pill
  wrapping at 320, Undo 44px tall, Settle-up footer 82px, Invite rows 6px shorter, You row 58px, Trips kicker position
  with the 42px wordmark row), the toast clearing the stacked bottom bars on all three tabs (code shows the same
  `BottomBar` plus `TripNavBar` stack and the same 106px constant as the existing List notice), focus ring and
  contrast. Class strings and DOM structure are covered by jsdom/SSR tests only.
- Design board coverage: no canvas was opened; boards O (You) and A (Home) are still to be redrawn per design.md 13.
- `pg_cron` execution itself (only the registration logic was exercised, with a stub), live `supabase_realtime`
  publication contents, and PostgREST behaviour for the new RPCs (PGRST202 mapping is unit-tested, not end to end).
- Postgres 10.5 differs from the live major version; only PG11-syntax lines were adapted, and no feature used by 0024
  is newer than 9.6.
