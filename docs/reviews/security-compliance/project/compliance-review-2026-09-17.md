# Compliance review — whole-app, 2026-09-17

Scope: whole-project review, not a single feature. Covers the current data
model (`supabase/migrations/*.sql`, `docs/ARCHITECTURE.md`), the
simplified-onboarding anonymous-auth rework (ADR 0006), the Gmail→Resend
email vendor switch, `docs/market-research.md`, and the roadmap's product
principles for forward-looking product scope. I'm flagging exposure, not redesigning the
feature or the app; anything marked "needs legal sign-off" is a real legal
question, not something I'm answering for you.

This is not legal advice and does not substitute for your own counsel —
several items below turn on jurisdiction-specific legal conclusions (does
GDPR/CCPA apply to this user base today, is a display name alone
"personal data," etc.) that only counsel can close out.

---

## Blocking concerns (real regulatory exposure as the app stands today)

### 1. No privacy policy or terms of service anywhere in the app
Grepping `src/app/`, `public/`, and the layout/metadata turns up no
`/privacy`, `/terms`, or equivalent page, and no link to one anywhere in
the UI. `docs/ANALYTICS.md` even says outright: *"Splitiful's privacy
policy should mention..."* — i.e., it's written as something that should
exist, and doesn't.

**Why it matters:** the app collects names, emails, and financial
data (who paid what, who owes whom) from users the product description
itself says "may be anywhere in the world." GDPR (Art. 13/14) requires a
privacy notice at the point of collection for EU users regardless of
company size; CCPA has its own disclosure requirements once thresholds
are met. Right now there is nothing to point to that discloses what's
collected, why, which vendors (Supabase, Resend, Vercel Analytics) touch
it, how long it's kept, or how to exercise any rights over it. This is
the single biggest gap in the review — everything else below is a detail
of what such a policy would need to say accurately.

**Mitigation:** add a privacy policy and terms page (even a short one)
before expanding the user base past friends-and-family dogfooding,
covering: what's collected (name, email, expense amounts, dates/
locations of trips), the three processors (Supabase, Resend, Vercel),
retention (currently: indefinite, see #3), and how to request deletion
(currently: no path, see #2). **Needs legal sign-off** on exact required
disclosures for your target jurisdictions.

### 2. No account-deletion or data-export path anywhere in the codebase
Grepped for `deleteUser`, `admin.deleteUser`, export flows, and any
"delete my account" UI — none exist. There is no RPC, API route, or
Supabase Admin call anywhere in `src/` or `supabase/migrations/` that
removes a user's `auth.users` row, `trip_members` rows, or `expenses`
rows on request, and no way for a user to get a copy of their own data
out.

**Why it matters:** this is a hard gap against GDPR Art. 17 (right to
erasure) and Art. 20 (right to portability) if any EU user is in scope,
and against equivalent CCPA "right to delete"/"right to know" provisions.
It's not a theoretical future feature — the app already stores real
names, emails, and financial history with no way to unwind it. Note that
`ON DELETE CASCADE` on `trips.created_by`/`trip_members.user_id`/
`expenses.paid_by` means the *database structure* would clean up
correctly once a user's `auth.users` row were deleted — the missing piece
is entirely the trigger (a user-facing request path + an admin-privileged
call to actually delete the row), not schema work.

**Mitigation:** add a minimal "delete my account" flow (even a support-
email-triggered manual process backed by a documented internal runbook
would close most of the immediate exposure) and a basic data-export
capability (a JSON dump of the user's own trips/expenses is enough to
start). This does *not* need to solve "what happens to a shared trip's
expense history when one member deletes their account" perfectly on day
one, but that tension (an expense row references `paid_by`, which is
load-bearing for every other member's balance) should be flagged to
counsel/product as a real design question, not silently deferred forever.
**Needs legal sign-off** on whether anonymizing (e.g. nulling `paid_by`
after cascade-safe handling) vs. hard-deleting is required, and on
retention obligations that might conflict with an erasure request (e.g.
financial recordkeeping — see #5).

### 3. No retention policy for abandoned anonymous accounts
Per ADR 0006 (accepted 2026-09-16), every visitor who starts creating a
trip gets a real, permanent `auth.users` row via
`signInAnonymously()`, before any email is ever collected. The ADR's own
"Consequences" section says plainly: *"`auth.users` accumulates a
permanent row for every anonymous session ever created, including ones
that never convert... No cleanup/expiry job exists for these."* Some of
these rows have an associated `trip_members.display_name` — a
self-chosen name, often a real first name — attached from the moment of
trip creation, with no email ever collected and no way to trace or reach
that person again.

**Why it matters:** this is personal data (a name, at minimum) with no
retention limit and no owner who can ever be identified or contacted to
honor a deletion request, since there's no email on the row to reach them
through even if you wanted to. Combined with #2, there's no path to clean
this up even manually today, and combined with #1, no policy commits to
a retention period at all.

**Mitigation:** add a scheduled cleanup job (e.g. a Supabase cron
function) that deletes anonymous `auth.users` rows (and their cascaded
`trips`/`trip_members` rows) past some age threshold if never verified —
e.g. 30-90 days. This was already flagged as a known gap in the ADR
itself, not a new finding, but it's worth surfacing here explicitly as
the compliance-relevant version of that operational concern.

---

## Advisory notes (best practice, not necessarily a hard legal requirement)

### 4. Resend is a new personal-data processor with no documented basis
The Gmail→Resend switch (`src/lib/email.ts`, `src/app/api/trip-email/route.ts`,
`src/app/api/join/route.ts`) sends a recipient's email address, their
trip's name, and a link to the trip to Resend's API on every trip
creation/join. This is a narrower payload than Gmail SMTP effectively had
(no financial data, no other members' names), which is good
data-minimization, but it's still a new sub-processor with access to
email + trip name that didn't exist before this switch, and (per #1)
isn't disclosed anywhere. Once a privacy policy exists, Resend needs to
be named in it, and it's worth confirming Resend's own DPA/terms are
acceptable for your jurisdictions (**needs legal sign-off** — this is a
vendor-contract question, not a code question).

### 5. Financial recordkeeping: no immutability/audit trail for a disputed split
`expenses.amount`/`description` can be edited by the paying member (RLS
`update` policy, ADR 0002) and deleted by *any* trip member (RLS
`delete` policy — `docs/ARCHITECTURE.md` flags this itself as
"intentionally not yet scoped to `paid_by`," since no delete UI exists
yet). There's no history/audit table — an edit or delete is silent and
irreversible from the other members' perspective. For a small
friends-group splitting a bar tab, this is a fine, low-stakes product
choice. It becomes a real dispute-resolution problem if Splitiful is ever
used for larger sums or less-trusting groups (e.g. the payment-rail
integration listed among the roadmap's current non-goals would raise the
stakes considerably if it's ever revisited). Not a blocking issue given
today's stated use case and the former vision's explicit rejection of payment rails,
but worth a product note: if a delete-expense feature ships (flagged as
in-scope in the roadmap's historical September 2026 priority snapshot), narrowing
`delete` to the payer (matching the existing `update` policy, per ADR
0002's own "consequences" note) closes a real gap where any member can
currently erase another member's logged expense.

### 6. Placeholder members: third-party personal data entered without their consent
`add_placeholder_member` (migration 0008) lets an organizer add a
name-only member ("Dad," "Aunt Lin") who never sees or consents to their
name being stored. This is personal data about someone who isn't a user
of the app at all. In the "small trusted friend group" context this is
clearly low-risk and arguably necessary for the feature to work (it
exists specifically for people who'll never have an account — see
`docs/adr/0004-placeholder-member-nullable-user-id-and-identity-key.md`),
so this is advisory, not blocking. Worth naming in a privacy policy once
one exists ("an organizer may add other people's names to split an
expense with them") rather than assuming it's obviously covered.

### 7. Consumer-facing copy: "keeps your email just to know it's you next time"
`docs/features/simplified-onboarding/design.md` §6 has this line for
invitees: *"{trip name} keeps your email just to know it's you next
time."* Checked against actual behavior: the email is used for OTP
sign-in and to send the "you're on the trip" confirmation email via
Resend — both consistent with "know it's you." It is *not* shown to other
trip members (the roster UI only ever renders `display_name`, never
email) and isn't used for anything else in the codebase today. The claim
holds as of this review, but it's an implicit purpose-limitation promise
("just") — if a future feature ever reuses stored emails for something
else (marketing, cross-trip recommendations, etc.), this line would need
to be revisited or the feature would contradict it. Advisory: keep this
copy in mind as a constraint the next time a feature touches email use,
not a rewrite needed now.

### 8. Vercel Analytics: documented well, one soft spot
`docs/ANALYTICS.md` and `src/lib/tracking.ts` are genuinely good practice
here — event names only, no PII fields, explicitly documented. Two minor
notes: (a) the doc's own "Privacy & Compliance" section already
acknowledges *"If privacy regulations (GDPR, CCPA, etc.) require an
explicit opt-in or opt-out mechanism, a future feature can add a cookie
banner"* — i.e., it flags but doesn't resolve whether Vercel Analytics'
collection (which includes IP-derived signals server-side, even if not
persisted into the event payload) needs a consent mechanism for EU
visitors. **Needs legal sign-off**, not a code fix, on whether Web
Vitals/analytics collection requires cookie-consent treatment under
ePrivacy/GDPR for this app's visitor base. (b) `docs/knowledge.md` and
parts of `docs/ARCHITECTURE.md`'s mermaid diagram still say "Gmail SMTP"
— stale relative to the Resend switch; not a compliance issue by itself,
but worth fixing so anyone using these docs to reason about
processors/vendors doesn't miss Resend.

### 9. Product direction and market research (reviewed 2026-09-17): no near-term new compliance surface, but two items to watch
The roadmap's product principles list payment-rail integration and
multi-currency for v2 ("can wait indefinitely without hurting the core
pitch"), which is good — those are exactly the features that would add
real compliance surface (money-transmission licensing questions, FX
disclosure). Nothing else in the roadmap (expense delete, UX polish)
changes the data picture. Flagging only so this doesn't get lost if v2
scope shifts later: **if payment-rail integration or multi-currency is
ever revisited, treat it as a fresh compliance review trigger**, not an
extension of this one — money movement and cross-border currency
conversion bring in different regulatory regimes (money transmitter
rules, FX disclosure) that nothing in this report addresses.

---

## Summary

**Blocking (fix before wider rollout, not just theoretical):**
1. No privacy policy/terms anywhere in the app (§1)
2. No account-deletion or data-export path (§2)
3. No retention/cleanup policy for abandoned anonymous accounts created by
   the simplified-onboarding flow (§3)

**Needs legal sign-off specifically (not a call I can make):**
- Exact disclosure requirements for your target jurisdictions once a
  privacy policy is drafted (§1)
- Anonymize-vs-hard-delete tension between erasure requests and shared
  expense history (§2)
- Resend's DPA/contract terms adequacy (§4)
- Whether Vercel Analytics collection needs cookie-consent treatment for
  EU visitors (§8)

**Advisory (best practice, not urgent):**
- Narrow `expenses` delete RLS to the payer if/when a delete-expense
  feature ships, matching the existing update policy (§5)
- Name placeholder-member data handling explicitly once a privacy policy
  exists (§6)
- Keep the "keeps your email just to know it's you next time" copy
  honest if any future feature reuses stored emails (§7)
- Fix stale "Gmail SMTP" references in `docs/knowledge.md`/
  `docs/ARCHITECTURE.md`'s diagram now that Resend is the actual vendor
  (§8)
- Treat any future payment-rail/multi-currency work as a fresh compliance
  trigger, not an extension of this review (§9)
