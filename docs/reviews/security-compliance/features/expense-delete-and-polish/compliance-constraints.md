# Compliance constraints: expense-delete-and-polish

Mode: requirements, re-check of the changed version (Undo-only, then hard erase). Date: 2026-10-19.
Not legal advice. Baseline read first. This file replaces the earlier version, which assumed hidden
rows are kept; those constraints (retention rule, runbook erasure of hidden rows, purge rules for
hidden-only payers, the /privacy line and date bump, "Recently deleted") are withdrawn because no hidden
row is retained any more.

## Verdict

No stop. No new blocking gap beyond what the 37 criteria already contain, provided the conditions in
section 1 and the finalize-delay constraint (section 2) are carried into design. Settle-up, Invite and
Feedback items have no compliance exposure (feedback copy, storage and form unchanged).

## 1. Money records: irreversible erase with no audit trail

Acceptable under the baseline, conditionally. The rule says a change to what someone owes needs an audit
trail OR an explicit user action; it does not require keeping the row. This design relies on the explicit
action limb, and it holds because all of these are true (each is already a criterion; keep them):

- Only the payer can delete, enforced in the database (16, 19, 20, 22). Closing the insert gap (22) matters:
  without it a payer could be a person who never entered the expense.
- Only on an open trip. After lock nothing can be deleted or undone (7, 16, 17), so a settled or locked
  amount is never altered. If the trip locks inside the window, the expense was already excluded from the
  balances at lock, so lock records the post-delete state and the later erase changes no locked figure (23).
- Explicit action plus a visible Undo window (2, 3).
- The same payer can already edit the amount of their own expense on an open trip with no audit trail
  today, so delete is no weaker than existing behavior.

Already-visible balances: an expense that others have already seen in their balance disappears. That is
acceptable on an open trip, because balances are provisional until lock and the app has no "mark paid", so
no settled or paid amount can be affected. Two conditions:

- Constraint M1: if an in-app "mark paid / settled" feature is ever added, this delete must be re-reviewed
  before it ships (a payment recorded against a balance that includes a later-erased expense is a
  dispute). Record this in the architecture notes and the baseline.
- Constraint M2 (advisory): a member may have paid someone off-app based on a displayed balance. This
  risk is accepted and is the same as for edit; the Terms already say the app does not move money. No
  notification (10) is the user's decision; do not describe delete as "approved by" anyone.

The "who deleted" log stays out; with payer-only it adds no information. `deleted_at` (27) is fine: a
timestamp, no new personal data.

## 2. Finalize (erase) delay and failure

Constraint F1: the architect states a maximum time from window end to erase and a backstop (18). If the
finalize job is down, the row must stay excluded from balances and unreadable by other members (21), so
a missed erase fails closed for money and still hides the free text. Recommended bound: erase within
minutes in normal operation, with a hard cap of 24 hours by backstop, and a note in the runbook on how to
check for rows past their window (`deleted_at < now() - interval '1 day'`). A long-lived "deleted" row
would make the in-app word "deleted" untrue in practice and is the one way this feature could regress
the privacy position. Prove with a no-client test (18).

Constraint F2: erase removes the expense row and clears list-item links in one transaction (23). Copies
in backups and provider logs remain until they expire; /privacy already says so, so nothing to add, but
the UI must not claim removal from backups.

## 3. Export and account erasure

- Export: the existing `expenses_paid` query (by `paid_by`) includes any row still inside its window.
  That is correct and needs no special handling. The runbook note in criterion 28 is enough: "a deleted
  expense is erased shortly after the Undo window, by a scheduled finalize; a row inside its window is
  exported like any other".
- Account deletion case A/B: a row inside its window counts as "paid an expense", so a request in the
  last minutes may need to wait for finalize (or run finalize manually first). Runbook note: if the
  requester just deleted an expense, run the finalize step (or wait) before the case A check. FK
  `paid_by` has no ON DELETE action, so criterion 28's test (never an orphan, never a failed delete that
  corrupts a balance) is required and is enough.
- Anonymous purge (0018) skips payers; a row in window delays the purge by at most one day. Fine.
- `was_removed_from_trip` (0014): a payer with only an in-window row is briefly not seen as removed.
  Harmless. No special rules needed (matches 28).
- Because rows are erased, the departed-payer limit (15) is the only stuck case. It means a
  departed member's expense, with their free-text description, stays until the trip or account erasure.
  That is today's behavior and covered by the existing runbook, not new.

## 4. Copy and privacy/Terms

- No `/privacy` or Terms change is right. Privacy says expense data "is kept while the trip exists and
  until you ask us to delete it" and "you can also edit your own entries in the app". Both stay true: the
  app now offers a way to delete earlier, which is more favorable than the text. `LEGAL_LAST_UPDATED`
  stays "October 13, 2026"; `revision3-docs.test.ts` pinning it remains valid. Revisit if finalize delay
  becomes long or any hidden row is retained (then retention text and the date bump return).
- Constraint C1: "deleted" is now accurate after erase. Allowed copy: "Expense deleted. Undo". Do not
  say "erased from all systems", "removed from backups", or "only you can see it". Optional and fine:
  "Can't be undone after this" on the toast, but only if Undo really fails afterwards (5).
- Constraint C2: the Undo failure message (5) is plain and does not reveal row content.
- Constraint C3: analytics for delete/Undo carry the event name only, listed in `docs/ANALYTICS.md` (30).
- Public summary (21) returns no descriptions: keep.

## 5. Other lenses

No new data, vendor, message, minors, cross-border or lawful-basis issue. The finalize job is
server-side only and sends nothing (26).

## Decisions for the user

None blocking. One confirmation, recommended default: accept that after lock-in of a future "mark paid"
feature delete will be reviewed again (M1), and accept the maximum erase delay the architect proposes
(recommended: minutes normally, 24-hour hard cap).

## Needs legal sign-off (not blocking)

- Whether irreversible erase of a money record with no audit trail is acceptable in a jurisdiction that
  imposes bookkeeping duties on consumer trip ledgers (none known for a personal expense splitter;
  counsel to confirm).
- Existing open positions (erasure of amounts on shared expenses) are unchanged.

## Baseline gap

Add to Money records: "Irreversible erase of a money record is allowed only for the record's own payer,
on an open trip, as an explicit action with an Undo window, and while no settled/paid state exists. Adding
any settled/paid state requires re-review of every delete path." Add to Personal data: "A feature that
hides then later erases must state the maximum time to erase and keep hidden rows unreadable by other
members in the meantime."

---

## Design review (stage 7) - 2026-10-19

Read: architecture.md, design.md, ADR 0017, and the baseline edits. Result: **pass, no blocking design
gaps.** Two exact fixes (D1, D2) for the docs/engineering stages and one release gate (G1).

### Baseline edits (confirmed)

- Personal data rule (hide-then-erase: state max time, hidden rows unreadable in the DB read path,
  operator check, second layer if the scheduler is optional, say plainly what is only operational):
  matches my constraint and the architecture. Confirmed as written.
- Money records rule (payer only, open trip, explicit action with Undo, database enforced, no
  settled/paid state; re-review on any settled/paid state) and the open counsel position: confirmed as
  written. No text fix needed.

### Pass/fail per constraint

| Constraint | Result | Evidence / note |
|---|---|---|
| Money: payer only, DB enforced, insert pinned | Pass | Arch 2.2, 3.2 (EX001 for all failures), 11 |
| Money: locked trip blocks delete and Undo; lock-vs-delete race | Pass | Arch 3.2 step 5 (trip row `for share` serialises with `complete_trip`; a lock records the post-delete state; erase ignores lock state, changes no locked figure) |
| Money: explicit action plus Undo | Pass | Design 2.1, 3 (no confirm by default; see advisory A1) |
| M1 (re-review if mark-paid ever added) | Pass | Arch 12, ADR 0017 Watch, baseline, design section 5 note |
| M2 (off-app payment risk, no "approved by") | Pass | No wording implies approval or notice |
| F1 max erase delay stated, hidden meanwhile, backstop, runbook check | Pass, with release gate G1 | Arch 4.3: about 90 s with cron, "within 2 minutes"; hidden by RLS regardless of erase; second layer (opportunistic erase inside delete/Undo); overdue query and `cron.job` check; the 24 h cap is plainly called operational, not a code guarantee when pg_cron is absent and the app is idle. That honesty is what the baseline asks for. |
| F2 erase and list-item links atomic, backups not claimed | Pass | Arch 4.1 (defensive link revert, FK `on delete set null`); design caption claims only "can't be brought back" |
| Export | Pass | Owner/service-role export by `paid_by` includes an in-window row; runbook note pending (D2) |
| Account deletion / purge / `was_removed_from_trip` interplay | Pass, runbook text pending (D2) | Arch 5 table: FK blocks account delete inside window until erase; purge skips payer up to a day; both tested (arch 10) |
| C1 copy facts only | Pass | Design 10: "Expense deleted", "Undo", "Expense restored", "can't be brought back" (true: Undo fails after 15 s and the row is gone from 30 s). No "erased from all systems", no backup claim, no "only you can see it". Screen-reader text equally neutral. |
| C2 Undo failure plain, no row content | Pass | One message for window passed / erased / locked; network case distinguished by absence of code; no id, amount or text in any pill. Design toast never shows name or amount. |
| C3 analytics name only | Pass with fix D1 | Design 11 names `expense_delete_complete` and `expense_undo_complete`, no properties; `timeClient` labels fixed, no ids. Architecture 6 names different events (`expense_delete`, `expense_delete_undo`). |
| Public summary: no descriptions, filters deleted rows | Pass | Arch 5: `get_trip_summary` filter in the LEFT JOIN `ON`, same return table, already no descriptions |
| Hidden rows unreadable to members | Pass | RLS `deleted_at is null`; static guard test for new readers |
| No notification / trigger / realtime leak | Pass | Arch 1 and 11; publication check in QA and release checklist |
| /privacy and /terms no change, no `LEGAL_LAST_UPDATED` bump | Pass, still true | Nothing is retained beyond about 2 minutes in normal operation, no new data collected (`deleted_at` timestamp and a nullable FK uuid carry no personal data), no new vendor, no new analytics beyond event names. The sentence "kept ... until you ask us to delete it" stays literally true. Revisit only if G1 fails (rows retained for long). |

### Fixes

- **D1 (analytics name mismatch).** design.md section 11 says `expense_delete_complete` and
  `expense_undo_complete`; architecture.md section 6 says `expense_delete` and `expense_delete_undo`.
  Use the design names (they match the existing `expense_edit_complete` style), correct architecture.md
  section 6, and list exactly those two names, no properties, in `docs/ANALYTICS.md`. Baseline: names
  only, closed set, no ids, counts or amounts.
- **D2 (runbook, docs stage; not yet written, so not a design failure).** Add to
  `docs/runbooks/account-deletion-and-export.md`: (a) a deleted expense is erased about 2 minutes after
  delete by a scheduled job (30 s eligibility plus the 1-minute schedule), and an in-window row is
  exported like any other; (b) before account deletion case A or B, if the requester deleted an expense in
  the last few minutes, wait or run `select public.erase_expired_expenses();` as the postgres owner, then
  run the check; (c) the overdue query (`deleted_at is not null and deleted_at < now() - interval
  '10 minutes'`, must be 0) and the `cron.job` check for `erase-expired-expenses`; (d) a stated
  frequency and owner for the check (recommended: daily, by the operator) so the 24 h cap is an actual
  commitment, not just a sentence. Also the one-line note that migration 0024 must be applied before the app
  deploy (section 7.2) and the release checklist items (`cron.job` row, publication check returning zero
  rows).

### Release gate

- **G1 (blocks ship, not design).** Confirm `pg_cron` is enabled on the live project and the
  `erase-expired-expenses` job exists after applying 0024 (architecture "Needs the user" item 1). If it
  is not enabled, "erased within 2 minutes" is false for an idle deployment and the daily check becomes the
  only control; in that case either choose the Vercel cron fallback before ship, or accept in writing a
  weaker stated bound. Do not put any time figure in user-facing copy either way (none does today).

### Advisory (non-blocking)

- A1: no confirm step before delete (design decision 1) puts the full weight on the Undo. Acceptable
  under the baseline wording ("explicit action with an Undo window"). The caption under the button
  ("After that, it can't be brought back.") is true and is what makes the action informed; keep it.
- A2: design says a second delete within 10 s replaces the first toast (earlier expense can no longer be
  undone from the screen), architecture describes a list of pending entries. Product call, no compliance
  effect; the database still accepts Undo until 15 s regardless.
- A3: the Settle-up placeholder line "then mark it paid" predates this feature and implies an in-app
  "mark paid" that does not exist. Not blocking (older claim, baseline allows). Worth fixing when M1 is
  next reviewed.
- A4: the opportunistic erase is global (any user's delete may erase another trip's expired rows). It only
  erases rows already past 30 s, nothing is returned to the caller, so there is no disclosure issue.
- A5: no new blocking finding at design stage, so no earlier mode missed anything; baseline already carries
  the new rules.
