# Compliance constraints: account-deletion-self-service

Mode: requirements review (stage 4). Date: 2026-10-21. Reviewed: [requirements](../../../../features/account-deletion-self-service/requirements.md), [planning](../../../../features/account-deletion-self-service/planning.md), the [compliance baseline](../../project/compliance-baseline.md), the delete, export and anonymous-retention runbooks, `/privacy`, `/terms`, `src/lib/legal.ts`, [ADR 0017](../../../../adr/0017-expense-delete-soft-mark-then-erase.md) and the [data model](../../../../reference/data-model.md). This is not legal advice. Items marked "open counsel question" are not resolved here and are non-blocking per the user's Checkpoint 1 decision.

## Verdict

Shape is acceptable: case A self-service plus an email route does not weaken any erasure right. There are **2 blocking gaps** (B1, B2) and one stop-level copy rule (C1) that the pm must fold into the requirements before Checkpoint 2.

## Blocking gaps

**B1. Criterion 18 says "what remains: nothing of the user's on this path". That is not literally true and must change.** After a case A hard delete these copies remain for a time: database backups held by the hosting provider; Supabase authentication logs; Resend delivery records for trip-link and sign-in emails (the address and trip name were sent to it); Vercel hosting logs and analytics (IP address); Upstash rate-limit counters (IP, short-lived); `rpc_rate_limits` rows until the hourly purge; and the remembered email in the user's own browser storage. The existing page already says backups and provider logs "may keep copies for a limited time", so the fix is to keep that sentence and make the new copy consistent with it, not to add a stronger claim. Required: replace "nothing remains" with an accurate list (see "Facts the copy must state"). The confirmation and post-delete screens must not say "everything is gone" or "permanently deleted" without the qualifier. Engineering to verify before the copy is final: whether the auth provider's audit log keeps the email or IP after user deletion, and how long backups live. If unknown, say "for a limited time" and do not state a number.

**B2. Case A as written can silently change other people's balances, which the requirements say it cannot.** Shares are not stored; each share is the equal split across current members (data model). Criterion 2 checks only "paid no expenses" and "organizes no shared trip". A user who is a plain member (not payer, not organizer) of someone else's trip with expenses is "eligible", and the hard delete cascades their membership away, shrinking the denominator and raising every other member's share. Existing leave paths (`leave_trip`, `remove_trip_member`) work only on open trips; this path would also remove a member from a **completed** trip, changing its final amounts with no audit trail and no user action by those members. That violates the money-record rule (a settled or locked amount is never silently edited) and the line in Risk surface that "no balance changes by construction". Required, one of: (a) add to eligibility "is a member of no trip that has any expense (or is completed)", enforced in the database (criterion 13) and tested; the blocked reason text covers it and the Request deletion button appears; or (b) the architect shows the user must first leave each such trip through the existing `leave_trip`, which is open-trip only, and completed trips with expenses are blocked. The pm chooses. Test additions to criterion 13: plain member of a completed trip with expenses, and plain member of an open trip with expenses.

## Constraints

Numbering is C-n. "Maps to" is the requirement criterion or a new one.

C1. **Must.** "Permanently deleted" (or any equivalent) may appear only where literally true, and only with a short qualifier on the same screen or the linked page: your account, email, memberships, solo trips and feedback are deleted from the live service now; copies can remain in backups and provider logs for a limited time. Rationale: consumer-claim rule (copy literally true). Maps to criteria 8, 9, 18 (new: confirmation screen and post-delete page carry the qualifier; QA checks the exact strings).

C2. **Must.** The typed-confirmation screen states, before the button enables, the list of what is deleted and that it cannot be undone, and says that people on shared trips are not affected by this path (there are none, by eligibility). It must not promise that the email can later be reused or that data is "wiped from all systems". Maps to criterion 8.

C3. **Must.** `/privacy` gets a new "Deleting your account" description consistent with B1, and the existing "may replace your name with Former member" paragraph stays and is re-worded so it is clear it describes the **email-request route**, not the in-app button. Maps to criterion 18.

C4. **Must.** `/privacy` Retention section: the line "After a deletion request, we remove or anonymize your data as described below" currently says "below"; update it so it points to the correct section. Keep the backups and provider-logs sentence. State that Resend, Vercel, Supabase and Upstash keep their own copies under their own schedules. Add no retention period we cannot show. Maps to criterion 18.

C5. **Must.** The 30-day promise stays as `REQUEST_RESPONSE_DAYS`. Do not describe the in-app delete as "a request". Keep identity verification wording ("we may ask you to confirm it is you"). GDPR allows one month, extendable for complex cases; CCPA allows 45 days; 30 days is within both, but it is only a promise if the inbox is monitored. Add to the runbook a named check of the inbox. Maps to criterion 20.

C6. **Must.** Coverage of the other rights: the Request deletion route and the copy route must both be reachable by someone who is **not** eligible and by anonymous accounts. The anonymous state shows the email route (criterion 7). Do not make deletion the only way to ask for a copy. Maps to criteria 5, 6, 7, 21.

C7. **Must.** Mailto flows (criteria 21, 22): the subject and body are fixed text. They contain no user id, no display name, no trip name, no expense data, no email address, and no reason code that reveals the block reason (a reason such as "paid an expense" is account-behaviour data; it stays in the user's own message if they choose to add it). The page copy says the email is sent from the user's own mail app and we receive it only if they send it. No server call, storage write or analytics event on tap. Maps to criteria 21, 22, 23 (guard with a test that the href is a constant).

C8. **Must.** The erase path stores no new personal data: no deletion log row with the email or user id, no "deleted accounts" table, no tombstone containing the email, no error log with ids or emails. If the operator wants a count, it is a counter without identity. A record of the fact of deletion with a hash or user id would be new personal data needing its own retention rule; it is a non-goal here. Maps to criteria 11, 23.

C9. **Must.** Retention for anything new: there is none, so no retention rule is needed. If the architect adds any table (an idempotency key, a queue, a lock row), it must hold no email and no name and be removed by the same transaction or by an existing purge. The rate-limit rows written by this action are covered by the hourly `rpc_rate_limits` purge; the architect confirms the key does not hold the email. Maps to criterion 15.

C10. **Must.** Runbook consistency: [delete-an-account](../../../../runbooks/delete-an-account.md) case A and the app eligibility check must be the same rule, written once. Whatever B2 decides must also be written into the runbook case A query (today it omits membership in others' trips). The runbook's "wait about 2 minutes" note stays. A single test or doc check keeps the two in step (new: a test that fixture users classed A by the SQL in the runbook are the same set the database function allows). Case B and C stay operator procedures. The [export runbook](../../../../runbooks/export-user-data.md) is unchanged (no new data location) but the operator must be told to export **before** a requester deletes in-app; since the in-app path does not export automatically, the pre-delete screen links to the copy request (criterion 21) and says the copy is not automatic and cannot be made after deletion. Maps to criteria 20, 21.

C11. **Must.** Ownership rule (user decision): only the account holder erases their own account or email. Criterion 4's test must also prove that an operator-less path (organizer, other member) cannot reach the erase function even with a crafted id, and that the function ignores any id argument. Maps to criteria 4, 13.

C12. **Must.** Throttling and abuse (criterion 15) must not leak whether another account exists; error text is generic and code-only (criterion 11).

C13. **Should.** Minors. Terms and `MIN_AGE = 13` unchanged. The self-service button does not change the under-13 position: the privacy page already tells people to email us if a child's data is held. Do not add an age gate here. Parent or guardian erasure requests remain on the email route. The 13 versus 16 EU question is an existing open counsel question, unchanged by this feature.

C14. **Should.** Financial record: blocking payers (criterion 6) is the correct choice and needs no change; do not add a "force anyway" path. The blocked-reason text must not name trips or other members (criterion 6, already stated). Also acceptable to say "people on your trips would see changed amounts", in generic words, to explain the block.

C15. **Should.** Signed-out confirmation page (open question 4): static page, no query parameters, no analytics event carrying the deletion outcome, no cookies or storage written. Clear the "remembered email" local storage key on successful deletion, or state in the page copy that it stays in the browser and how to clear it; either is acceptable, silently leaving it is not (the privacy page describes it as a user-controlled item).

C16. **Should.** Open question 1 (fresh sign-in before delete) is a security decision, but for erasure rights it matters as a **wrongful erasure** risk: an irreversible erase by an attacker with a stolen session also destroys the owner's data with no restore. Recommend the pm keep the default for v1 but the copy must not claim that the account is protected against this. Security review decides.

C17. **Advisory.** Hosting-vendor and auth-provider data: deleting a user in the auth provider removes the user record and its linked sessions and identities; it does not reach logs or backups. Do not write that the provider "deletes" the data. If a regulator or customer later asks, the processor agreement path (provider deletion on request) is operator work, not part of this feature.

C18. **Advisory.** Feedback rows: case A deletes them by cascade, which is the stated position and consistent with `/privacy`. Retention of feedback after erasure on the **shared** path stays an open counsel question; this feature does not touch it. Name-only members: the person typed as a placeholder by someone else is not an account holder, cannot use this button, and nothing in this feature removes their name; the privacy copy continues to route them to the email request (runbook case C). Do not imply the button covers placeholders added by the user.

## Shipping before counsel answers

Acceptable, with these caveats written into the release checklist (not into public copy): (1) B1 and B2 resolved; (2) the privacy copy makes only the claims listed below; (3) the case B text ("Former member") remains described as what may happen on request, not as a right; (4) open counsel questions (placeholder-only erasure, feedback retention, past-trip name rewrites, expense erase without audit trail) stay open and are neither answered nor made worse by this feature; (5) the later shared-data path stays gated on counsel and a store listing. Nothing here is a reason to hold the release for counsel.

## Facts the /privacy and /terms copy must state

1. Who can delete in the app: a signed-in person with a confirmed email who has paid no expenses, is on no trip with expenses (per B2 outcome) and has no trip with other people on it.
2. What deletion removes now: the account and sign-in identity, the email address, the display name and memberships, trips only they were on (including the typed trip type), and their feedback.
3. What remains for a limited time, as copies: backups, and logs kept by Supabase, Vercel, Resend (delivery records of emails we sent to the address) and Upstash (IP, short-lived). Rate-limit records are deleted within about a day (matches existing text). State no figure that is not verified.
4. Deletion cannot be undone and no copy can be produced afterward; to get a copy, ask first by email (the link is on the same screen). We do not create a copy automatically.
5. For everyone else (paid an expense, on a shared trip, no email), the route is an email to the privacy address; we aim to answer within 30 days; the shared-data outcome ("Former member", amounts kept unnamed) is described as what may happen, and is not offered as the in-app result.
6. People added by name only by someone else are not accounts; they email us to ask for removal or anonymization.
7. Unverified anonymous accounts are removed after 90 days of inactivity (existing text, keep exceptions for those who paid or organize a shared trip).
8. The Request deletion and copy links open the person's own mail app; we receive the message only if they send it (matches Terms wording on Invite by email; the Terms line "ask us to delete your account as described in the Privacy Policy" is updated to also say they can delete it in the app when eligible).
9. `LEGAL_LAST_UPDATED` bumped in the same change; `legal.test.ts` list moved forward (criterion 19).

Do **not** state: "permanently deleted" without qualifier; "removed from all our systems"; "we keep nothing"; a backup retention period; that deletion is "verified" or "secure" beyond what exists; that the button covers shared data.

## Stale living pages noticed

- [delete-an-account](../../../../runbooks/delete-an-account.md) case A query omits membership in other people's trips (see B2). Not edited here.
- The Terms "Termination" paragraph and the Privacy "Retention" bullet ("as described below") predate this feature; the pm/engineer update them in the feature PR.

## Baseline gap

Rule to add to the compliance baseline: "Hard-deleting an account removes its memberships. A deletion path must not remove a member from a trip that has expenses (especially a completed trip) unless the same rule already applies to the existing leave and remove paths, because each share is the equal split across current members. Deletion copy must list what remains in backups and processor logs, not only what is removed." This was missed in requirements, not code, so it is recorded as a late-found rule only if the pm accepts B2 after approval.
