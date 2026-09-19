# Simplified onboarding

## Problem statement

Today, every visitor to Splitiful hits the same first screen
(`src/app/page.tsx`): a "Trips are fun. The math isn't." landing page whose
only action is entering an email address and requesting a sign-in code
(Supabase `signInWithOtp` magic link). There is no way to reach trip
creation without this step — `src/proxy.ts` protects `/trip/new` and
`/trip/[id]` (see `PROTECTED_PATTERNS`) by redirecting any unauthenticated
request back to `/` with `?next=`. Concretely, the current path for a
brand-new visitor is:

1. Land on `/` → forced to type an email.
2. Wait for and open a magic-link email.
3. Land back on `/trip/new` (via `next`) only now authenticated.
4. Fill out trip details and create the trip.

That's real friction (an email round-trip) before a first-time user has
seen any value at all — they haven't even named a trip yet and they're
already asked to trust the app with their email and wait on an inbox. Most
products in this space let you try the core action first and only ask for
identity when there's something worth protecting.

The user need: let a first-time visitor go straight to creating a trip with
zero email/login step, land in the trip and view it immediately, and only
ask for an email when there's a concrete reason to need it — making any
change to the trip (adding an expense, inviting others), or wanting to see
more than the trip's summary numbers. Viewing a trip's summary via an
invite link should need no auth at all. The existing email + sign-in-code
flow should still exist, reused unchanged, just triggered by those
specific moments instead of shown upfront.

## Current flow (for reference)

- `/` (`src/app/page.tsx`): email field + "Send me a sign-in code" →
  `supabase.auth.signInWithOtp({ email })` → routes to `/check-email`.
- `/check-email`: tells the user to check their inbox for the code/link.
- Verifying the code authenticates the browser (Supabase session cookie)
  and lands back on `next` (defaults to `/trips`).
- `/trip/new` (`src/app/trip/new/page.tsx`): trip details form → calls
  `createTrip()` (RPC `create_trip`) → best-effort POST to
  `/api/trip-email` (sends a "you created a trip" confirmation email to the
  now-authenticated user) → redirects to `/trip/{id}/invite`.
- `src/proxy.ts` gates `/trips`, `/trip/new`, and `/trip/[id]*` on having an
  authenticated Supabase session; anything else redirects to `/` with
  `?next=<original path>`.
- `remember-signin-email` (shipped) only prefills the email field on `/` —
  it does not skip the sign-in-code step itself.

Net effect: authentication currently happens *before* a trip can exist at
all, and before it can even be viewed, for every user, every time.

## Desired flow

### Organizer (new/first-time user)

1. Landing on `/` with no existing session shows a welcome message and one
   prominent, unmissable action: **"Create your first trip"**. No email
   field, no sign-in-code affordance is shown or required at this stage.
2. Tapping it creates the trip immediately. Underneath, a Supabase
   anonymous session is created (if one doesn't already exist on this
   browser) and set as the trip's owner via RLS — real, server-backed
   authorization, not a client-only flag. The user lands on the trip page
   right away and can **view** it — trip details, summary numbers, etc. —
   with no email required. Creation and viewing are both free.
3. On the trip page itself, while the organizer's session remains
   unverified (anonymous, never confirmed an email), the mutating action
   entry points — **Add expense**, **Settle up**, and **Invite others**
   (which includes everything reachable only from the invite screen, i.e.
   placeholder-member add/rename/remove) — are **hidden entirely**. They
   are not shown as disabled/greyed-out buttons and are not reachable by
   any route on the page; there is nothing to tap that would let the
   organizer discover the verification wall by attempting the action
   first.
4. In their place, the trip page shows an **inline verification call to
   action**: an email input with copy along the lines of "Confirm your
   email to start adding expenses or inviting others." This is not a
   one-time prompt shown only right after creation — it persists and
   reappears on every visit to the trip page for as long as the
   organizer's session remains unverified.
5. Entering an email there sends the OTP code, and **the code-entry step
   happens inline on the trip page itself** — the email input is replaced
   by a code-entry input in the same view, with no navigation to
   `/check-email` and back. This reuses the existing `signInWithOtp` +
   code-verification implementation as its underlying mechanism; only the
   surrounding UI (inline vs. a separate page) differs for this case.
6. Once confirmed, Supabase's anonymous-to-permanent linking upgrades the
   existing anonymous session to that real email identity, so the trip's
   RLS ownership (already pointing at that session's user id) carries over
   automatically with no reassignment/migration step. The trip page then
   reveals the normal Add expense / Settle up / Invite others buttons,
   fully enabled, with no further gate — the organizer proceeds to
   whichever action they open next as a fresh, un-gated flow (there is no
   in-progress expense draft, invite action, or placeholder edit to
   "resume," because none of those screens/actions were ever reachable
   before verification completed).
7. Because verification now happens strictly before the organizer can
   reach the add-expense form, invite screen, settle-up action, or
   placeholder management, the trip's own view (summary and full detail)
   stays fully free and viewable throughout, exactly as before — nothing
   about viewing changes here.
8. Returning in the same browser later, while the session persists:
   straight back into the trip, no re-prompt, no welcome screen. If the
   session was never verified, the inline verification CTA from step 4
   simply reappears — that is the expected, ongoing state, not a bug.
9. Returning with no browser memory of any session (new device, cleared
   storage): the existing sign-in-by-code flow (email + OTP, full-page,
   same as it works today for a returning visitor) is the way back in,
   landing on a **trips landing page** (not a single trip), since one
   email can span multiple trips.

**Note — this hide-and-reveal, inline-OTP pattern applies only to the
organizer's own trip.** It replaces the earlier "let the organizer start
the action, then interrupt them on submit to confirm, then resume what
they were doing" pattern for that case specifically. It does **not**
change anything about the invitee experience below, which keeps its
original attempt-then-redirect-then-resume pattern unchanged.

### Invitee (anyone opening an invite link)

8. Opening an invite link lets the visitor view the trip's **summary**
   with zero auth — no email, no code, no session of any kind required.
   "Summary" means the final-answer-style numbers (overall totals,
   who-owes-whom), per `docs/v2-vision.md`'s "final answer" framing — not
   the detailed expense list/line items. This is a plain public-read RLS
   policy scoped to the trip/invite id, not something gated by session
   state.
9. The moment the invitee tries to view the **detailed expense list**
   (line items), or to **add or edit an expense**, either action is still
   the trigger for the existing full-page email + OTP sign-in flow
   (attempt the action → redirect to the sign-in/code screen → resume the
   original action on success) — unchanged from before, and **not** the
   organizer's hide-and-reveal/inline pattern above. Confirming ties the
   invitee to the trip as a verified member from then on, via their own
   anonymous-to-permanent linked session, and unlocks both detailed
   viewing and writing in that one step — there is no separate gate
   between "can see line items" and "can add/edit an expense" once
   verified.

### Summary of the permission boundary (three tiers)

For an **invitee** (no ownership relationship to the trip), there are
three tiers of access, in increasing order of trust:

1. **Public, zero-auth: trip summary only.** No session of any kind
   required. Gated only by knowing the trip/invite id.
2. **OTP-verified: full detailed expense view (line items).** Requires a
   verified session — reaching this tier is what the "view details"
   trigger unlocks.
3. **OTP-verified, same session, no extra step: add/edit expenses.**
   Verification unlocks both tier 2 (read-detail) and tier 3 (write) at
   once — there is no additional gate between being able to see line
   items and being able to add/edit them.

For the **organizer**, viewing their own trip is not tiered the same way:
creation and full viewing (summary and detail alike) are both free from
the start, backed by the anonymous session's RLS ownership of that trip —
there's no reason to hide an owner's own trip detail from them. What *is*
gated for the organizer is any **mutation** (add/edit/delete expense,
settle up, invite/share, placeholder-member management) — but unlike an
invitee, who hits the OTP trigger by attempting the action and getting
redirected, the organizer never sees those action entry points at all
until verified: the buttons themselves are hidden, replaced by an inline
verification prompt on the trip page (see Desired flow, step 3–5). So the
write-side rule is consistent across both roles (mutating a trip always
requires a verified session), while both the read-side rule *and* the
mechanics of how verification is triggered differ by relationship to the
trip: an owner's anonymous session sees everything about their own trip
and is walled off from mutation via hidden buttons + inline OTP; a
non-owner sees only the summary and is walled off from both detail-view
and mutation via attempt-then-redirect OTP.

## Acceptance criteria

**Organizer: immediate use, no email required**

1. A visitor with no existing session sees a welcome message plus a single
   prominent "Create your first trip" call to action on `/` — no email
   field and no sign-in-code affordance is shown or required at this
   stage.
2. Submitting the trip-creation form starts a Supabase anonymous session
   (if one doesn't already exist on this browser) and creates the trip
   with that session's user id granted ownership via RLS, landing the
   organizer inside the usable trip without ever having entered an email
   or a code.
3. The organizer can fully **view** their own trip (summary and detailed
   expenses alike) immediately post-creation, backed by the anonymous
   session's RLS ownership — no email/OTP prompt is shown for viewing.
4. "Create your first trip" is onboarding copy only — it does not enforce
   a one-trip limit. A session/email may own or belong to multiple trips.

**Hide-until-verified + inline OTP — organizer (any mutation)**

5. The following mutating entry points are **hidden entirely** (not shown
   disabled, not reachable by any route on the trip page) whenever the
   organizer's session is unverified (anonymous, never confirmed an
   email), enumerated exhaustively as:
   - Add expense (and, by extension, edit/delete an existing expense);
   - Settle up (marking the trip complete);
   - Invite others / Share, and everything reachable only from that
     screen, i.e. adding, renaming, or removing a placeholder member (the
     `add-placeholder-members` RPCs from migration 0008).

   This list must be treated as exhaustive for "mutation" on a trip, not
   illustrative — any new trip-mutating action added to the product in the
   future must be added to this list and hidden/gated the same way, rather
   than assumed to be covered by the general principle (see Decisions 11
   and 12).
6. In place of the hidden entry points, the trip page shows a persistent
   inline verification call-to-action (an email input with copy such as
   "Confirm your email to start adding expenses or inviting others") for
   as long as the session remains unverified — this is not a one-time
   prompt shown only right after creation; it reappears on every visit
   until verification completes.
7. Submitting an email at that inline prompt sends the OTP code, and the
   code-entry step is completed **inline on the trip page itself** — the
   email input is replaced by a code-entry input in the same view, with no
   navigation away to `/check-email` or any other page. The underlying
   mechanism reuses the existing `signInWithOtp` + code-verification
   implementation as-is; only the surrounding presentation (inline vs. a
   separate screen) differs from the returning-visitor sign-in flow.
8. On successful verification, the organizer's anonymous session is
   upgraded to a permanent identity via Supabase's anonymous-to-permanent
   user linking, so the trip's existing RLS ownership (tied to that same
   user id) carries over automatically with no data reassignment or
   migration step, and the trip page immediately reveals the normal Add
   expense / Settle up / Invite others entry points, fully enabled with no
   further gate.
9. Because the organizer can never reach the add-expense form, the
   settle-up action, the invite screen, or placeholder management before
   verifying, there is no in-progress draft or in-progress action to
   "resume" after confirming for the organizer's own trip — this is a
   deliberate replacement of the previous attempt-then-redirect-then-
   resume pattern for this case, and only this case (see Decision 12).

**Invitee: three-tier access (public summary → verified detail → verified write)**

10. Opening a valid invite link lets any visitor view the trip's
    **summary** (overall totals, who-owes-whom) with no email, no code,
    and no session of any kind — enforced as a public-read RLS policy
    scoped to the trip/invite id, not as a client-side-only affordance.
11. The detailed expense list (line items) is **not** included in that
    public-read data — attempting to view it, or attempting to add/edit
    an expense, either one triggers the same email/OTP sign-in flow as
    the organizer's (criteria 5–7), reusing the identical implementation.
12. On successful verification, the invitee's session (anonymous session
    created for them if one didn't already exist, then linked to their
    verified email) becomes a real, verified member of the trip, and that
    single verification unlocks both the detailed expense view and the
    ability to add/edit expenses — there is no separate second gate
    between seeing line items and writing them.
13. There is no "who are you?" identity picker and no way to claim an
    existing member's name without completing real email/OTP verification
    — every write action, and every access to detailed expense data by a
    non-owner, requires a verified session.

**Returning visitors / multi-trip**

14. Returning to `/` in the same browser while a session persists (whether
    anonymous or upgraded) routes straight back into the trip — no
    welcome screen, no email/OTP re-prompt.
15. Returning with no browser memory of any session (new device, cleared
    storage, different browser) and a previously confirmed email sees the
    existing sign-in-by-code flow, unchanged in mechanics from today, and
    lands on a trips landing page listing the trips/memberships tied to
    that email (not directly into a single trip), since one email may span
    multiple trips.
16. An organizer who creates a trip and never completes the email/OTP step
    (never adds an expense, never invites anyone) has, by design, no
    credential to sign back in with if this browser's session is lost —
    this is a natural consequence of never having confirmed an email, not
    a special-cased failure mode, and needs no bespoke recovery flow or
    additional warning copy: almost any real use of the trip (adding an
    expense, sharing it) forces confirmation anyway.

**Server-side integrity (three-tier RLS boundary)**

17. The permission boundary described above is enforced by RLS policies
    and RPC-level checks, not merely by UI routing, hiding buttons, or
    which screen the app shows, as three distinct, independently-checkable
    tiers:
    - a direct API/RPC call for a trip's **summary** data succeeds with no
      session at all, given only the trip/invite id;
    - a direct API/RPC call for a trip's **detailed expense list**
      (line items) fails without a verified session that is a member of
      (or owns) that trip — a summary-level public request must not be
      able to read line-item data by, e.g., requesting a different
      field/endpoint;
    - a direct API/RPC call to **mutate** a trip — create/edit/delete an
      expense, `complete_trip` (settle up), whatever "invite" does
      server-side, and the placeholder-member RPCs (add/rename/remove) —
      fails without a **verified** session backing it. An owner's merely
      anonymous, unverified session is sufficient for reading its own
      trip's detail (per Decision 6) but is **not** sufficient for any
      mutation — the UI hiding the buttons (AC5) must be backed by every
      one of these RPCs independently rejecting an anonymous caller, not
      relying on the UI never offering the action as the only protection.
    All three must hold exactly as described even when called directly,
    not just via the app's own UI. This explicitly includes `complete_trip`
    (see Decision 13 on why this needed its own callout).
18. `src/proxy.ts`'s protected-path behavior is updated so it no longer
    redirects an anonymous-session trip creator away from their own new
    trip, and does not require a session at all for summary-level
    trip-viewing paths reachable via an invite link — RLS remains the real
    enforcement per the existing principle that the middleware check is
    optimistic.

## Non-goals

- Redesigning the visual style of the landing page beyond what's needed to
  present "welcome + create your first trip" instead of "email + sign-in
  code" as the primary action.
- Changing anything about how the sign-in-code email is sent, formatted,
  or verified — the existing OTP implementation is reused unchanged, only
  retriggered at new moments.
- A magic-link save/verification mechanism — considered in an earlier
  draft and explicitly dropped in favor of reusing the existing OTP code
  flow (see Decisions).
- Any save-draft-and-resume mechanism for the organizer's own trip (e.g.
  preserving an in-progress expense form or invite action across the
  verification step) — no longer needed once the entry points are hidden
  until verified, since there is nothing in progress to resume (see
  Decision 12). This mechanism is retained, unchanged, for invitees only.
- Any "who are you?" identity-claiming picker for invitees, or any way to
  attach a session to an existing member's name without real email/OTP
  verification — considered in an earlier draft (as "Flow F") and removed
  because it allowed unverified impersonation via a shared invite link.
- Any account-recovery flow for an organizer who created a trip, never
  confirmed an email, and later lost browser memory of the session — by
  design, out of scope (see Decisions).
- A separate, additional gate between viewing detailed expenses and
  writing them once an invitee is OTP-verified — verification unlocks
  both at once, by design (see Decisions); building a second permission
  check between them is explicitly not in scope.
- A full multi-trip dashboard/management UI beyond what's needed for the
  trips landing page (criterion 15) — in scope only at the level needed to
  route correctly, not as a richer account-management surface.
- Changing `/api/trip-email`'s "trip created" confirmation email beyond
  whatever the new sequencing requires (it currently assumes an
  authenticated user with an email at creation time; under this design a
  trip is very often created with neither — this is left as an
  implementation detail for architecture, not decided here, since it
  doesn't affect the auth/UX model).

## Decisions (locked for this feature)

These were raised and debated during scoping and have since been
resolved. They are locked for this feature — implementation should not
revisit them without a new checkpoint.

1. **Anonymous Supabase auth backs the organizer's pre-verification
   access.** Trip creation starts a Supabase anonymous session on that
   browser if one doesn't already exist, and RLS grants that session's
   user id ownership of the trip. This is real, server-backed
   authorization — not a client-only `localStorage` flag.
2. **The email/OTP prompt is triggered contextually, not shown upfront or
   passively.** For the organizer, the trigger is any mutating action on
   the trip, enumerated exhaustively in AC5: adding/editing/deleting an
   expense, taking an "Invite others" / "Share" action, or adding/
   renaming/removing a placeholder member — whichever happens first;
   viewing their own trip (summary and detail alike) never triggers it.
   For an invitee, the trigger is attempting to view the detailed expense
   list, or attempting to add/edit an expense; viewing the trip's public
   summary never triggers it. There is no other point at which email/OTP
   is requested (see Decision 11 on why this list is exhaustive, not
   illustrative).
3. **No magic link — reuse the existing OTP code flow as-is, for both
   triggers.** An earlier draft of this feature proposed a fire-and-forget
   magic-link "save" mechanism as a separate, non-blocking event from
   real sign-in. That is dropped entirely. Both the organizer's
   invite-trigger and the invitee's edit-trigger use the same existing
   `signInWithOtp` + code-verification implementation that already exists
   for returning-visitor sign-in — same UI, same mechanics, just invoked
   at a new moment instead of upfront.
4. **Verification upgrades the anonymous session via Supabase's
   anonymous-to-permanent linking, rather than creating a separate
   identity.** Completing the OTP step links the existing anonymous
   session to the confirmed email, so RLS ownership already tied to that
   session's user id carries over automatically. There is no separate
   "save" event, no reassignment step, and no parallel record to
   reconcile.
5. **Viewing a trip's summary via its invite link requires no auth at
   all.** This is a plain public-read RLS policy scoped to the trip/invite
   id, returning summary-level data only (overall totals, who-owes-whom —
   not line items). It is not implemented as "let anonymous sessions
   through" or any session-based check — a request with no session at all
   must be able to read the summary.
6. **Detailed expense data (line items) is a separate, higher tier from
   the public summary, gated behind OTP verification — not part of the
   public-read surface.** A non-owner (invitee) cannot see individual
   expenses until they verify; an owner's own anonymous session can see
   its own trip's detail without verifying (see Decision 1). This is a
   deliberate three-tier model: public summary, verified detail, verified
   write — not a simple two-tier public-read/verified-write split.
7. **Verifying unlocks detail-read and write together, in one step.**
   There is no additional gate between an invitee being able to see
   detailed expenses and being able to add/edit them — completing OTP
   verification grants both at once.
8. **Write actions require a verified session — mere ownership of an
   anonymous session is not enough — and there is no unverified
   identity-claiming.** An earlier draft ("Flow E"/"Flow F") proposed
   letting an invitee pick an existing member's name from a "who are
   you?" list and claim it without proof. That is removed entirely — it
   allowed anyone holding an invite link to impersonate an existing member
   and see/edit their attributed expenses with no verification. Under this
   design, every write — including the organizer's own, on their own
   trip, per Decision 12 — and, per Decision 6, every access to detailed
   expense data by a non-owner, requires completing real email/OTP
   verification first.
9. **Multi-trip is supported at the session/email level**, and
   sign-in-by-code (for an organizer or invitee with no browser memory of
   any session) lands on a trips landing page rather than a single trip,
   since one verified email may be tied to multiple trips/memberships.
   "Create your first trip" remains onboarding copy only, never an
   enforced one-trip limit.
10. **No confirmed email + lost browser memory = permanently inaccessible,
    by design, for v1 — with no bespoke warning needed.** An organizer who
    never completes the email/OTP step has no credential to sign back in
    with if this browser's session is lost. This is now a natural,
    self-evident consequence, even more so than in earlier drafts:
    virtually any real use of the trip beyond looking at it — adding an
    expense, viewing detail, inviting others — already forces
    confirmation, so anyone who wants recoverability gets it almost
    automatically as a side effect of actually using the trip.
11. **The organizer's "mutation" trigger list (Decision 2, AC5) is
    exhaustive, not illustrative, and explicitly includes placeholder-
    member management.** A QA pass on this feature found that an earlier
    draft's mutation list (add/edit expense, invite/share) omitted the
    placeholder-member RPCs — add, rename, and remove placeholder member,
    added by `add-placeholder-members` (migration 0008) — which let an
    anonymous, never-verified organizer manage placeholders indefinitely,
    inconsistent with the general "any mutation requires verification"
    principle this feature is built on. The general principle already
    implied placeholder management should be gated; this decision closes
    the gap by making the AC list name it explicitly, so it isn't
    reintroduced by a future pass that reads the AC list literally instead
    of re-deriving it from the principle. Any trip-mutating action added
    to the product after this feature ships must be added to that same
    enumerated list (Decision 2, AC5) as part of its own review — "falls
    under the general principle" is not sufficient on its own, precisely
    because this gap shows a specific list can silently miss a case the
    principle was meant to cover.
12. **The organizer's own trip switches from "attempt-then-redirect-then-
    resume" to "hide-until-verified + inline OTP entry," and this pivot
    applies ONLY to the organizer's own trip, never to invitees.** The
    original design let the organizer's trip page show its normal Add
    expense / Settle up / Invite others buttons unconditionally, attempt
    the action on submit, and only then redirect to `/check-email` with a
    save-draft-and-resume mechanism if unverified. Manual testing after
    the anonymous-session and RLS migrations went live surfaced that this
    pattern wastes user effort: someone fills in an expense form (or
    starts an invite) with no indication a verification wall is coming,
    only to hit it at the last step. The revised design hides those entry
    points entirely while unverified and replaces them with a persistent
    inline verification call-to-action on the trip page itself (email
    input → inline code-entry input, no navigation to `/check-email`) —
    so the organizer never invests effort into an action they can't yet
    complete, and there is no draft/resume state to manage since the
    action was never reachable to begin with. This does **not** extend to
    invitees: an invitee's experience (public summary view; attempt to see
    detail or write → redirect to the existing full-page OTP flow →
    resume the original action on success) is explicitly unchanged by this
    decision — the invitee case has no equivalent "wasted form-filling"
    problem to solve, since an invitee reaching detail/write in the first
    place is itself the trigger, not a separate button they'd have
    pre-filled.
13. **`complete_trip` (Settle up) had no anonymity guard at all, and is now
    included in both the SQL fix and the hide-until-verified UI
    treatment.** Further review alongside Decision 11's placeholder-member
    fix found a second, independently discovered gap: unlike `join_trip`
    and the placeholder-member RPCs, which migration 0010 already guards
    against anonymous callers, the `complete_trip` RPC had **no
    verification check in the database at all**, and the client-side
    `settle-up/page.tsx` had no `requireVerifiedSession` call either — an
    anonymous, never-verified organizer could mark a trip complete with
    nothing stopping them, client- or server-side. This is closed as two
    parts, both required: (a) a SQL migration adding the same anonymity
    guard pattern migration 0010 used for `join_trip`/placeholder RPCs, to
    `complete_trip`; and (b) including "Settle up" in the organizer's
    hide-until-verified button set (Decision 12, AC5) rather than leaving
    it visible and gated only on click. As with Decision 11, this is
    recorded explicitly, not left to ride on the general principle, so a
    future audit of "which mutations are gated" has a complete list to
    check against instead of re-deriving it and potentially missing this
    RPC again.

## Semver classification

**Feature** (backward-compatible from an external-contract standpoint, but
a significant UX and authorization-model change internally), with one
component that is properly a **bug fix**: the `complete_trip` RPC's
missing anonymity guard (Decision 13) is a pre-existing security gap
(present since the anonymous-session model was introduced) being closed
alongside this feature, not new-feature scope in itself. No existing
sign-in-by-code users lose functionality — the flow is still there, reused
unchanged, for the "no browser memory" case and now also inline (for the
organizer's own trip, per Decision 12) or via redirect (for invitees,
unchanged) as a contextual mutation/detail-view trigger — but the default
first-run and invite-link experiences change substantially, and this
requires an architecture-level change to trip authorization (Supabase
anonymous auth, anonymous-to-permanent linking, and a new three-tier RLS
model spanning public summary / verified detail / verified write), not
just a client-side UI reorder. Should be scoped and estimated accordingly.
