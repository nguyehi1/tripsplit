# Requirements: account-deletion-self-service

Stage: requirements (stage 3), revised at stage 4 to fold in the early security and compliance review. Date: 2026-10-21. Status: **requirements revised after early review; awaiting Checkpoint 2.**
Inputs: [planning.md](planning.md) (its "User decisions" section is authoritative; Checkpoint 1 approved option 2). Baselines read: [security](../../reviews/security-compliance/project/security-baseline.md) and [compliance](../../reviews/security-compliance/project/compliance-baseline.md). Early review (ran 2026-10-21, not rerun): [security-constraints](../../reviews/security-compliance/features/account-deletion-self-service/security-constraints.md) and [compliance-constraints](../../reviews/security-compliance/features/account-deletion-self-service/compliance-constraints.md). Today's procedure: [Delete an account](../../runbooks/delete-an-account.md) (case A is what this feature automates).

Items marked **Recommended, pending user approval at Checkpoint 2** come from the early review (both reviewers agreed) and widen or tighten what Checkpoint 1 approved. They are written in as criteria so the user can approve or reverse them as a block.

## Problem

Erasing an account is an operator task: the person emails, the operator verifies them and runs SQL. Most people who want out are casual joiners who paid nothing and run no shared trip; they should be able to leave in a minute, with honest wording about what goes. People who do have shared data should be told plainly why they cannot self-delete and how to ask. Shared-data deletion (runbook case B) is a later feature, gated on counsel and required before any app-store listing.

## Scope

On the You screen (`src/app/you/page.tsx`), one new area with three states:

1. **Can delete.** Shows "Delete account" (verified email, recent sign-in, safe case). A typed confirmation, then the account and its email are erased and the user is sent to a short "account deleted" page.
2. **Cannot delete yet.** Shows the reason in plain words and a "Request deletion" button that opens a prefilled email to the policy contact address (`PRIVACY_EMAIL`). If the only blocker is a stale sign-in, it offers "Send me a sign-in link" instead.
3. **No email (anonymous).** No delete button. Short text: unused guest accounts are removed after 90 days, and they can email for anything sooner.

Also in scope: a plain link to ask for a copy of data before deleting (a prefilled email, no automatic export), and same-change updates to `/privacy`, `/terms`, `LEGAL_LAST_UPDATED` and the runbook.

Semver: **feature** (backward-compatible; adds a capability, removes none). Flag for review: first user-triggered irreversible erase of an account, and it affects what eligibility means for people on other users' trips (criterion 2).

## Acceptance criteria

Who can delete, and when
1. The delete button appears only for a signed-in account that is verified (not anonymous, has an email, email confirmed), signed in within the last 10 minutes (criterion 8), and eligible (criterion 2). Anyone else never sees it. **Recommended (recency), pending user approval at Checkpoint 2.**
2. Eligible means: the user has paid no expenses; has created no trip that another member (including a name-only placeholder) belongs to, or that has any expense; **and is not a member of any trip created by someone else that has at least one expense, whether the trip is open or completed.** Deletion therefore never changes anyone's share or any settled amount, because each share is the equal split across current members. Expenses still waiting to be erased after a delete count. **Recommended (the other-people's-trips rule), pending user approval at Checkpoint 2.** This corrects the earlier claim that case A changes no balance by construction; that was only true for the first two conditions.
3. If the only blocker is an expense deleted in the last couple of minutes ([ADR 0017](../../adr/0017-expense-delete-soft-mark-then-erase.md)), the screen says to try again in a few minutes rather than sending them to email.
4. Only the account holder can delete their own account or remove their email. The action acts on the signed-in user only and accepts no user id, email, trip id or "force" input. An organizer removing a member, leaving a trip, or any existing action never deletes an account or an email (tested).
5. Organizers of open trips with other members see: finish the trip or have people leave first, then delete. They also see the Request deletion button.
6. People who paid an expense, or whose trip has other members or expenses, or who are on someone else's trip with expenses, see which kind of reason applies (generic wording, no trip names, counts or other members' names) and the Request deletion button. For an open trip with expenses owned by someone else the text also says they can leave the trip first; a completed trip routes to the email request. Generic wording such as "people on your trips would see changed amounts" is allowed. No automatic anonymize or "Former member" path ships here, and there is no "force anyway".
7. Anonymous accounts see no delete button and see the 90-day text plus the email route. Both the Request deletion route and the copy route are reachable by ineligible and anonymous users.
8. If the account is verified and eligible but the last sign-in is more than 10 minutes old, the screen offers "Send me a sign-in link" using the existing sign-in link flow, which returns to `/you` (fixed path, no query parameter carrying intent, nothing replayed). After signing in again, the user taps Delete again. **Recommended, pending user approval at Checkpoint 2.**
9. The status shown on the screen comes from one check that returns a closed list of reasons only (can delete, anonymous, unverified, sign-in too old, paid an expense, organizes a shared trip, member of a trip with expenses, retry soon), never counts, names or trip ids, and reads only the caller's own data. If the check is unavailable (new code, old database) the screen falls back to the Request deletion state and never shows Delete.

The delete action
10. The user types **DELETE** (exact, case-sensitive) before the button enables. The word is also checked on the server and never echoed back. It guards against accidents; the sign-in recency (criterion 18) is the control against a person holding the device. **Decision pending Checkpoint 2 approval (default taken).** The confirmation screen lists what is deleted and that it cannot be undone, says a copy cannot be made afterward (with the ask-for-a-copy link beside it, criterion 29), does not promise the email can be reused, and carries the same "backups and provider logs may keep copies for a limited time" qualifier as criterion 26.
11. On success the account, its email and sign-in identity, memberships, solo trips it organized (which by criterion 2 contain nobody else and no expenses), and its feedback are deleted. The user lands on a public, parameterless `/account-deleted` page that reads no session and writes no cookie, storage or analytics event. The proxy allows that route. The server clears the auth cookies itself and ignores sign-out errors (the user no longer exists). The remembered sign-in email in the browser's storage is cleared. A token issued before the deletion can do nothing afterward (tested). **Decision pending Checkpoint 2 approval (standalone page, default taken).**
12. Every outcome maps to a closed code set (ok, not eligible, sign-in required, retry soon, rate limited, unavailable). Failures show a plain message and may be retried. Raw database or auth errors, user ids, emails and trip ids never reach the screen, logs, timing labels, analytics or URLs. A foreign-key failure from a racing expense is mapped to the same not-eligible code.
13. Double submit and a second tab do nothing harmful. A second delete after the first finds no user and returns the same fixed code.

Database and security (tested on a scratch local Postgres, never the project `.env.local` points at)
14. The erase is one `SECURITY DEFINER` database function called on the user's own session. It reads the caller from the session, takes no user id, email, trip id or "force" parameter, and has execute revoked from public and anon and granted to signed-in users only. **Architect constraint:** prefer this over any service-role call. The Admin API is allowed only as a documented exception, in which case the function takes the uid, is granted to the service role only, and the server derives the uid from a verified `getUser()` (not a cookie or form field), with all other criteria still holding inside it.
15. Eligibility is enforced in that function, not only on the screen. It reads the verified/anonymous/email state from the `auth.users` row, not the token. Any failure (anonymous, unverified, ineligible, no such user) raises one fixed code-only error that reveals neither the reason nor whether the account exists. Calling it directly (curl or API) as an ineligible user is refused.
16. Check and erase cannot be raced apart. Inside one transaction the function throttles, locks every trip the user created, then runs the eligibility checks, deletes the user and asserts exactly one row went. The lock order is documented. A joiner, a placeholder add, or an expense add racing the delete either is seen by the check or makes the delete fail cleanly (never a half-erased account). Tested with two real connections: join vs delete, add-placeholder vs delete, add-expense vs delete (solo trip), two simultaneous deletes.
17. Eligibility is one shared definition used by both the status check and the erase function, and equals the runbook's case A. A test keeps the two in step (users classed A by the runbook SQL are exactly those the function allows). The runbook case A query is **fixed in the same change**: it omits membership in other people's trips with expenses (criterion 2).
18. The function requires `auth.users.last_sign_in_at` within the last 10 minutes and raises a distinct "sign-in required" code otherwise. This column changes on a fresh sign-in, not on token refresh. **Recommended, pending user approval at Checkpoint 2.** The design states the residual risk (an attacker who also has the mailbox open still succeeds).
19. Rate limit is per user, inside Postgres, keyed on the signed-in user (not per IP; the direct-to-API path does not carry a trustworthy IP). The architect states how failed attempts still count despite the rollback of a raising call, and the real direct API path is tested, not only the happy one. The function deletes that user's own rate-limit rows in the same transaction.
20. If a server action or route is used, it is POST only, keeps the framework origin check unweakened, and rejects a missing or cross-site origin. The database-function route from the browser needs no extra token because it needs the bearer token.
21. No new service-role call site by default. For the record, `createServiceClient` already has two call sites (the invite route and `getTripSummary`), so this would have been the third; the stale "exactly one call site" docblock in `src/lib/supabase/service.ts` is corrected in this change.
22. Cascades are retested: deleting the user removes memberships (including the member-removal trigger from migration 0015 for a plain member who added or claimed list items on a trip), solo trips with their `types`, `other_type` and list items, and feedback. Other users' rows are unchanged. The anonymous purge (0018) still works. No deletion log, tombstone or "deleted accounts" row is written; any new table must hold no email or name.
23. One new numbered migration, additive only (functions and grants, no table rewrite, no policy change, no past migration edited), idempotent, safe on tables that have rows. Function variables carry a prefix so they cannot clash with column names. Migration ships before code. New code with the old schema fails closed (function-not-found codes mean "unavailable"; Delete is hidden). Old code with the new schema is inert.
24. Test plan on a scratch local Postgres (never the live project, never port 3000): payer; payer whose only expense is already deleted but not yet erased; organizer with another member; organizer with only a placeholder; organizer of a solo trip with an expense; plain member of someone else's open trip with expenses; plain member of someone else's completed trip with expenses; plain member who added and claimed list items; anonymous; unverified; stale sign-in; wrong confirmation word; call as anon and as an anonymous-session signed-in user; a forged identity claim for a different user (acts only as that identity, no parameter); the races in criterion 16; double submit; and a privilege listing asserting exactly who may execute the function.

Copy and records
25. `/privacy` states who can delete in the app (signed-in, confirmed email, signed in recently, paid no expenses, on no trip with expenses, no trip with other people on it) and what deletion removes now: account and sign-in identity, email, display name and memberships, trips only they were on (including the typed trip type), and their feedback. It also says deletion cannot be undone and no copy can be made afterward. The existing "Former member" paragraph stays, re-worded so it describes the email-request route, not the in-app button. The Retention line "as described below" points to the right section. The Terms Termination line also says eligible users can delete in the app.
26. The deletion copy (confirmation screen, post-delete page, `/privacy`) never says "nothing remains", "removed from all systems", or an unqualified "permanently deleted". It keeps the existing sentence that backups and provider logs may keep copies for a limited time, on the same screen, and lists what can remain: backups; authentication logs; email delivery records of messages we sent to the address; hosting logs and analytics; rate-limit data (short-lived, deleted within about a day). It says each provider keeps its own copies under its own schedule. No retention figure is stated unless verified. Engineering verifies, before the copy is final, whether the auth audit log keeps the email or IP after a user is deleted; if unknown the copy says "for a limited time".
27. `LEGAL_LAST_UPDATED` is bumped in the same change and the `legal.test.ts` list moved forward.
28. [Delete an account](../../runbooks/delete-an-account.md) is updated: case A can be done by the user, the fixed case A query (criterion 17), a post-erase check query for leftover rate-limit rows, a named check of the privacy inbox for the 30-day promise, and a note to export before a requester deletes (the in-app path exports nothing). The deleted-expense wait note stays. Cases B and C stay operator procedures. The [anonymous-retention](../../runbooks/anonymous-account-retention.md) runbook is checked to have an operator check for the purge job. The export runbook needs no new data location.
29. The ask-for-a-copy link and the Request deletion button are `mailto:` links to `PRIVACY_EMAIL` with fixed subject and body constants. Nothing from the URL, name, email, user id, trip or the block reason is added. A test asserts the links are constants. The page says the message is sent from the user's own mail app and we receive it only if they send it. No server call, storage write or analytics event happens on tap.
30. No new personal data is stored and no new vendor is added. Any analytics event is name-only and listed in `docs/ANALYTICS.md`; none is required.

Existing behavior and tests
31. The You page QA test is extended for the three states, and a test shows the page payload (including the framework payload) for a signed-out or anonymous user contains no Delete control and no eligibility detail.
32. Everything else on You (name card, Privacy, Terms, Send feedback) is unchanged. Existing tests pass.

## Non-goals

- Deleting or anonymizing an account with shared data (runbook case B), "Former member" automation, organizer transfer. Later feature, gated on counsel, required before any store listing.
- Organizers deleting anyone's account or email. Removing a member from a trip stays as it is today.
- Delete button for accounts without an email.
- Automatic data export, a cooling-off period, an undo, a server-side request queue, or Splitiful sending any email.
- Case C (a placeholder-only person asking for removal): stays a runbook case. The button does not cover name-only members the user added.
- Erasing expenses, or changing any split or balance, for anyone. A "force anyway" path.
- A deletion log, tombstone or count that carries an identity.
- An age gate or changes to `MIN_AGE`; parent or guardian requests stay on the email route.
- Waiting for counsel before shipping the privacy copy. Counsel's open positions (erasure for placeholder-only people, feedback retention, past-trip name rewrites) stay open and non-blocking.

## Risk surface

- New personal data collected or stored: **none new.** The feature removes data and stores no record of the deletion (criterion 22).
- Message sent to a person: **present, minor.** Prefilled mailto from the user's own mail app to our contact address; the sign-in link uses the existing flow. Splitiful sends nothing new.
- New third-party vendor: none.
- Unauthenticated/public endpoint or anonymous abuse: **present.** Anonymous sessions can call any database function directly, so verified-email, recency and eligibility hold in the database (criteria 14 to 19). The new `/account-deleted` page is public and takes no input. A stolen open session is mitigated by the 10-minute sign-in rule (residual risk in criterion 18).
- Security: **present.** Irreversible erase; the design should avoid the service-role key (criteria 14, 21).
- Privacy: **present.** `/privacy` and `/terms` change; erasure behavior must match the copy exactly (criteria 25 to 27).
- Retention: **present.** Backups and provider logs keep copies for a limited time (criterion 26); feedback is removed by cascade on this path.
- Communications: present (mailto only, above).
- Changes to money records: **present, indirect.** No expense is edited. Because shares are the equal split over current members, removing a member would change others' amounts; criterion 2 prevents that for open and completed trips, enforced in the database.
- User-generated free text: none new.
- Consumer privacy/security claims: **present.** New copy says what is erased and what can remain; it must be literally true (criteria 25, 26).

Early security and compliance review: **ran 2026-10-21; constraints folded in below.** Design and final-code reviews still apply.

## Review constraints folded in

Security ([constraints](../../reviews/security-compliance/features/account-deletion-self-service/security-constraints.md)): B1 -> 2, 6, 24. B2 -> 1, 8, 18. B3 -> 21. C1 -> 14. C2 -> 15. C3 -> 4, 14. C4 -> 16. C5 -> 2, 3. C6 -> 17. C7 -> 18. C8 -> 10. C9 -> 19. C10 -> 20. C11 -> 11. C12 -> 12. C13 -> 9. C14 -> 22. C15 -> 19, 26, 28. C16 -> 23. C17 -> 24. C18 -> 29. C19 -> 31. C20 -> 28.

Compliance ([constraints](../../reviews/security-compliance/features/account-deletion-self-service/compliance-constraints.md)): B1 -> 26. B2 -> 2, 6. C1 -> 10, 11, 26. C2 -> 10. C3 -> 25. C4 -> 25, 26. C5 -> 28 (and the 30-day text in 25). C6 -> 7. C7 -> 29. C8 -> 22. C9 -> 19, 22. C10 -> 17, 28, 10. C11 -> 4, 15. C12 -> 12, 15. C13 -> non-goals. C14 -> 6 and non-goals. C15 -> 11. C16 -> 18 (copy must not claim protection against a stolen session, see 26). C17 -> 26. C18 -> non-goals, 25.

Not folded in: nothing. Two items are left to later stages by design: the exact failed-attempt throttle placement (criterion 19, architect) and the verified audit-log retention (criterion 26, engineering).

## Design coverage

No canvas or design board exists for this feature. The You screen is board O in [redesign-ui](../redesign-ui/design.md) and shows only the present rows. The ux-designer stage must design the three states, the stale-sign-in state, the typed confirmation, the blocked reasons, and the `/account-deleted` page.

## Decisions taken by default (pending Checkpoint 2 approval)

- Typed word is DELETE (criterion 10).
- A trip that holds only name-only placeholders blocks deletion; the user is told to remove the names first (criterion 2).
- After deleting, the user lands on a short standalone page (criterion 11).
- Sign-in recency and the other-people's-trips rule are recommended by both reviewers and written in as criteria 1, 2, 8 and 18; the user may reverse either at Checkpoint 2. These replace the earlier open questions on fresh sign-in and on "verified is enough".

## Open questions

None remain beyond approval of the decisions above.

## Sequencing

Build after [copy-list-from-past-trip](../copy-list-from-past-trip/requirements.md). Requests are very rare, so this is not urgent.
