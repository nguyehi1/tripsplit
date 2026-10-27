# Account deletion self-service: planning

Stage 1 record (2026-10-21). It captures the discussion and the options for the user to decide. It is not a requirements document and is not rewritten later. Current delivery status is on the [roadmap](../../product/roadmap.md).

## Raw idea

Let a signed-in user delete their own account and data from the You/settings screen, replacing the operator-run procedure in [Delete an account](../../runbooks/delete-an-account.md). It must handle:

- Users who paid expenses (`expenses.paid_by` has no `ON DELETE` action, so a hard delete is blocked).
- Trips they organize that other people belong to (`trips.created_by` cascades, so a hard delete would wipe the trip for everyone).
- Placeholder (name-only) members.
- Feedback rows (`feedback.user_id` cascades on a hard delete, but not on the soft delete the runbook uses for shared data).
- Anonymous accounts.
- The "Former member" choice: anonymizing keeps the equal split unchanged, deleting a member changes everyone's share.

The privacy page, Terms and the runbook would need updating. Counsel's erasure questions are still open (placeholder-only people, feedback retention, past-trip name rewrites, as listed under "Open positions awaiting counsel" in the [compliance baseline](../../reviews/security-compliance/project/compliance-baseline.md)). The roadmap lists account-deletion self-service as a privacy follow-up.

## Context found

- Today's erasure is an operator runbook with three cases: A (hard delete when nothing is shared), B (soft delete, rename to "Former member", delete feedback, clear the typed trip type) and C (a person who exists only as a placeholder). Case B was never counsel-approved.
- Splits are not stored; each share is the equal split across the current member count ([data model](../../reference/data-model.md)). A hard-deleted member shrinks the denominator. A payer with no member row already renders as a "ghost payer" ([ADR 0012](../../adr/0012-post-removal-detection-and-ghost-payer-rendering.md)).
- A just-deleted expense stays in the table for up to about 2 minutes and blocks a user delete ([ADR 0017](../../adr/0017-expense-delete-soft-mark-then-erase.md)). Compliance rule M1: a money record may be irreversibly erased only by its own payer, on an open trip, with an Undo window.
- Trips have no update path and the organizer cannot leave, so a trip whose organizer is anonymized cannot be administered by anyone.
- `/privacy` already tells users that deleting an account "may replace your name on shared expenses with Former member and keep the amounts, unnamed". It promises a 30-day response to requests. Anonymous accounts that never verify are purged after 90 days, except ones that paid or organize a shared trip.
- A server-only service-role client exists (`src/lib/supabase/service.ts`) with one call site today. Self-service deletion would be a second, far more sensitive one.
- Process note: the compliance baseline pointed at a runbook named `account-deletion-and-export.md`; the real pages are `delete-an-account.md` and `export-user-data.md`. The baseline and the starter-list release checklist now link to the real pages. Older records keep the old name, and the Moved pages table in `docs/README.md` maps it.

## PM initial take

- Add a "Delete account" action on `/you`: typed confirmation plus fresh re-auth, then one server action that follows the runbook A/B split automatically (hard delete if nothing is shared, otherwise soft delete plus anonymize), signs out, and shows "what was removed, what remains". Copy must be literally true.
- Expenses the user paid on shared trips: keep and anonymize (runbook B). Erasing them on open trips would silently change others' balances; blocking deletion frustrates the user.
- Trips they organize: anonymize and keep if completed; block if the trip is open with other members (tell the user to complete it or have members leave). Organizer transfer is a separate later feature.
- Placeholders they added: anonymize to "Former member" if the trip is kept, never delete them automatically (changes splits); they go with the trip if it is hard-deleted.
- Feedback: delete all of it (the cascade will not fire on a soft delete, so delete explicitly).
- Case C (a placeholder-only person asking to be removed) stays a runbook case: different actor.
- Edge cases: expense deleted in the last 2 minutes, last remaining member, no undo (strong confirmation), anonymous users have no email to re-verify, partial failure across Admin API and SQL (retryable, ideally one database function for the SQL steps), "Former member" must render everywhere, not only the expense list.
- Fuller version, deferred: organizer transfer, expense erase with Undo, export prompt, cooling-off period.

## Product-strategist recommendation

- Ship smaller and do not build it ahead of `copy-list-from-past-trip` (roadmap: build next). Deletion touches neither core moment in the [principles](../../product/principles.md).
- Pressure is operator toil and trust, not law. GDPR/CCPA require honoring requests within a deadline, not an in-app button, and the email route plus the 30-day promise meets that if the inbox is answered. App-store rules (in-app deletion) apply only to store-listed apps; Splitiful is a web app. A store or PWA listing would change this to mandatory.
- Real risks: irreversible and destructive, a wrong branch wipes others' trips or balances, anonymous or stolen sessions, and baking in positions counsel has not validated. A self-service session does remove the identity-verification step, which is a real runbook cost.
- Recommended shape: self-service only for the safe case A (paid nothing, organizes no shared trip), verified email or recent re-auth, typed confirmation, eligibility enforced in the database, export nudge. Everyone else sees why and gets a "Request deletion" button (prefilled email to the privacy address, same pattern as mailto invites). No self-delete button for anonymous accounts (they auto-purge). Wait for counsel before automating case B.
- Cheaper steps below that: a request-by-email button only; a server-side request queue (new data and a send path, needs rate limiting).

## Agreement and disagreement

Agree:
- Never hard-delete when it would break others' balances or trips; anonymize to "Former member" and keep amounts.
- Strong confirmation, no undo, re-auth, database-side checks (not only UI), and literal-truth privacy copy.
- Organizer transfer, expense erase with Undo, and cooling-off are out of scope.
- Feedback is deleted; placeholder deletion never changes splits automatically.

Disagree:
- Case B automation. PM: build it in v1 (it is the common case for anyone who ever paid). Strategist: defer until counsel answers; v1 handles only case A. This is the central scope call and goes to the user.
- Timing. PM treats it as the next build; strategist sequences it after `copy-list-from-past-trip` and asks whether real demand exists.
- Anonymous accounts. PM wants them covered; strategist says no button.
- Open trips with other members. PM blocks deletion; strategist routes these to the request button (same effect, different wording).

Not done: the two agents ran in parallel and were not put into a back-and-forth. The disagreements above are as first stated and are laid out for the user.

## Options

| Option | What ships | For | Against |
|---|---|---|---|
| 1. Request button only | "Request deletion" on `/you` opens a prefilled email to the privacy address. Runbook and privacy copy updated. | Almost no engineering; no new erase paths; counsel-neutral | Operator still verifies and runs SQL; does not really replace the runbook |
| 2. Self-serve safe case, request for the rest (strategist) | Delete button when the user paid nothing and organizes no shared trip, else explanation plus request button | Covers casual joiners with least risk; reuses the runbook's checks | Anyone who paid an expense still emails; two paths to explain |
| 3. Self-serve safe and shared cases (PM) | Option 2 plus automatic anonymize for payers and organizers of completed trips; open shared trips blocked | Fully replaces the runbook for ordinary users | Builds the counsel-unvalidated case B in code; biggest review surface; partial-failure risk |
| 4. Defer entirely | Keep the runbook | No cost now | Operator toil stays; no good-faith signal |

## Recommended direction

Option 2 now, designed so case B can be added later. Gate on a verified email, typed confirmation and a database-side eligibility check. Update `/privacy`, `/terms`, `LEGAL_LAST_UPDATED` and the runbook in the same change. Sequence it after `copy-list-from-past-trip` unless the user says deletion requests are frequent or a store listing is planned. Case C and anonymous-with-shared-data stay runbook cases.

## Sharpest tradeoffs

1. Build the shared-data (case B) path now or wait for counsel: faster full replacement of the runbook versus codifying an unapproved erasure position.
2. Order against `copy-list-from-past-trip`: a privacy follow-up with little current demand versus the roadmap's stated next build.
3. Strict blocking versus convenience for organizers of open trips: protects other members but can leave a user unable to delete without help.

## Open questions for the user

Each is asked on its own, with a default.

1. Is a mobile app-store or home-screen app listing planned, or have you had a request you could not handle in time? Default: no. (If yes, in-app deletion becomes required and moves up.)
2. How often do deletion requests arrive? Default: rarely (a few a year), which supports doing this after the next planned build rather than before.
3. Should this ship before or after copy-list-from-past-trip? Default: after.
4. Should people who paid an expense or organize a shared trip be able to delete themselves in the first version, or be sent to the email request? Default: sent to the email request; add the automatic path once counsel answers.
5. If you later allow it: should their amounts stay on others' trips, unnamed, as "Former member"? Default: yes, keep and anonymize; never erase other people's balances. (Counsel's view on whether that counts as erased is still open.)
6. For trips still open with other members, should the organizer be blocked from deleting? Default: yes, ask them to finish the trip or have people leave first.
7. Should accounts without an email get a delete button? Default: no. They are purged after 90 days of inactivity and can email for anything sooner.
8. Should we offer a data export prompt before deleting? Default: a plain link to ask for a copy, no automatic export.
9. Should the first version wait for counsel's answers before the privacy copy is changed? Default: no; ship with copy that states exactly what is removed and what remains.

## User decisions

Recorded at Checkpoint 1 (2026-10-21).

- **Q1, app store:** a store or home-screen listing is a long-term plan, not current. The recommended direction stands. The later in-app path for people with shared data (option 3) becomes required before any store listing.
- **Q2, frequency:** deletion requests are very rare, and the product is still early. Q3 to Q9 take the defaults listed under Open questions: build after copy-list-from-past-trip; people who paid or organize a shared trip are sent to the email request in version 1; amounts stay as "Former member" when that path is later allowed; organizers of open trips with other members are blocked; no delete button for accounts without an email; a plain link to ask for a data copy; privacy copy ships without waiting for counsel.
- **Ownership rule:** only the account holder can delete their own account and remove their email from the database. An organizer can remove a member from a trip but can never delete the account or the email.

## Next stage

On approval, `pm` writes `requirements.md`. Compliance and security reviews are needed early, because the work adds an irreversible erase path and a second service-role call site (see the [security baseline](../../reviews/security-compliance/project/security-baseline.md)).
