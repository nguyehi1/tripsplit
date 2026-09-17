# Simplified onboarding — design

Companion to `requirements.md` (locked decisions — this doc does not
re-decide anything there) and `docs/v2-vision.md` ("simplicity is the
feature" / "final answer" framing). Scope here is the user-facing flow,
screens/states, and copy only — data model and RLS are an architecture
concern.

Reuse baseline (read before building): `src/app/page.tsx` (current
welcome/email screen), `src/app/trip/new/page.tsx` (trip-creation form,
unchanged), `src/app/check-email/page.tsx` (OTP entry — reused as-is),
`src/app/trip/[id]/page.tsx` + `trip-tabs.tsx` (trip dashboard, Expenses/
Details tabs), `src/app/trip/[id]/add-expense/page.tsx`, `src/app/trip/[id]/
invite/page.tsx`, `src/app/trips/page.tsx` (trips landing page — already
built for the authenticated case, reused as the multi-trip landing
target), `src/app/join/[code]/page.tsx` + `welcome/page.tsx`. No modal/
dialog component exists in `src/components/ui.tsx` today — every gate in
this app is its own full screen (`Screen` / `ScreenContent` / `TopBar` /
`BottomBar`). The OTP trigger for an **invitee** still follows that
pattern (§6): a full screen the user is routed to, not an overlay, so it
stays consistent with the rest of the app and requires no new component.

**Revision (this pass):** the **organizer's** own trigger no longer
follows that pattern — Decision 12 replaces it with a hide-until-verified
+ inline-OTP treatment that lives directly on `/trip/[id]` and never
navigates to `/check-email` at all (§4, rewritten below). That is the one
deliberate exception to "every gate is its own full screen" in this app:
the inline verification section is a new, small stateful piece of the
trip page itself (email step → code step, in place), not a new route and
not a modal/overlay — it reuses the same `Field`/`Button` primitives and
the same `signInWithOtp`/`verifyOtp` calls as `/check-email`, just laid
out inline. See §4 for the shape. This does not affect the invitee flow
(§5, §6), which is unchanged and still uses `/check-email` as before.

---

## 1. Screen inventory

| Screen | Route (existing/new) | Auth tier | Status |
|---|---|---|---|
| Welcome | `/` | none | **Redesigned** (was email form) |
| Trip creation | `/trip/new` | anonymous session (created on submit) | Unchanged |
| Trip dashboard (owner, verified) | `/trip/[id]` | verified, owner | Unchanged (already tier-agnostic for viewing) |
| Trip dashboard (owner, **unverified**) | `/trip/[id]` | anonymous, owner | **Revised this pass** — view (summary + detail) still fully shown; Add expense / Settle up / Invite / placeholder-management entry points hidden and replaced by one shared inline verification section, in place, on this same route (§4). No navigation to `/check-email` for this case. |
| Trip summary (public) | `/trip/[id]` or `/join/[code]` | none | **New rendering path** for non-owner, no session |
| Detailed expense view | `/trip/[id]` (Details tab) | verified, member (invitee); free for owner regardless of verification | **New gate** in front of existing tab — invitee only |
| Add/Edit expense | `/trip/[id]/add-expense`, `/trip/[id]/expense/[id]/edit` | verified-or-owning | **Invitee:** unchanged attempt-then-redirect gate in front of existing screen (§6). **Organizer:** entry point hidden entirely pre-verification — this screen is unreachable for an unverified owner, not gated on submit (§4, revised this pass). |
| Settle up | `/trip/[id]/settle-up` | verified-or-owning | **Newly gated this pass** (Decision 13) — same hidden-until-verified treatment as the organizer's other mutations (§4); previously had no client-side or server-side anonymity guard at all. |
| Invite / Share | `/trip/[id]/invite` | verified-or-owning | **Invitee:** n/a (owner-only screen). **Organizer:** entry point (the roster icon button) hidden entirely pre-verification, same as above — the old "let them land on the invite screen, then gate Copy/Share on tap" shape is dropped (§4, revised this pass). |
| Sign-in-by-code (OTP entry) | `/check-email` | — | Unchanged, reused — **invitee triggers only** as of this pass (`detail`, `invitee-expense`); the organizer's own triggers (`add-expense`, `invite`, `placeholder`) no longer route here at all (superseded by the inline widget, §4). |
| Trips landing page | `/trips` | verified | Unchanged, reused as multi-trip landing |
| Join-by-invite entry | `/join/[code]` | none → verified | **Superseded by summary view** (see §5) |

---

## 2. Welcome screen (`/`) — redesigned

Replaces the current email-first screen. No email field, no sign-in
affordance shown by default.

**Copy:**

- Wordmark chip: `ts` (unchanged)
- Headline (unchanged — it already earns its place and isn't the thing
  being fixed): "Trips are fun.\nThe math isn't."
- Subhead (revised — currently promises "join with one link," which is
  the invitee's story, not the organizer's; the primary path is now trip
  creation):
  > "Add what you spend. We'll work out who owes who — no account
  > needed to start."
- Primary action (full-width, accent button, same visual weight as
  today's "Send me a sign-in code"):
  > **"Create your first trip"** with the existing arrow icon.
- Secondary action (unchanged control, ghost button, already exists
  today): **"I have an invite link"** → same prompt-and-extract-code
  behavior as today, routing to `/join/[code]`.
- Stat strip (unchanged, still true): "∞ expenses a day" / "0 accounts to
  join" — the second one is now *more* true than before, so keep it.

**What's removed:** the `Field` for email, the "Send me a sign-in code"
button, and the remembered-email prefill logic on this screen — that
logic moves to being triggered contextually (§4) rather than living on
first paint. `remember-signin-email` itself (the storage helper) is still
used, just no longer read on `/`.

**States:**

- *Returning visitor, session persists* (criterion 14): `/` never
  actually renders this welcome content for them — middleware/page logic
  sends them straight to their trip (single trip) or `/trips` (multiple),
  matching "no re-prompt, no welcome screen." This is a routing rule, not
  a UI state of this screen; noted here so the screen inventory is
  complete. No loading spinner state is needed for this check if it can
  happen server-side before paint; if a client-side check is used instead,
  show nothing (blank `Screen` shell, no flash of the welcome copy) rather
  than a spinner, to avoid a flash-then-redirect that reads as a bug.
- *No session* (first-time visitor): welcome content as above.
- *Error creating the anonymous session on submit* (rare — Supabase
  outage, network failure): inline error under the button, same style as
  every other screen's error text (`text-terracotta`, 13px):
  > "Couldn't start your trip — check your connection and try again."
  Button returns to its normal (non-loading) state so they can retry.

---

## 3. Trip creation (`/trip/new`) — unchanged

No copy or flow changes. The only behavioral difference (an architecture
concern, noted here for completeness) is that submitting now creates an
anonymous Supabase session first if none exists, rather than requiring
one to already exist. The screen doesn't need to know or show this — it's
invisible plumbing. The confirmation email currently sent via
`/api/trip-email` is out of scope for this doc (see requirements.md
Non-goals) — assume for design purposes that it either doesn't fire yet
(no email to send to) or is deferred until the organizer verifies.

After creation, the existing redirect to `/trip/[id]/invite` no longer
fits — the organizer hasn't earned an OTP trigger yet just by creating a
trip (criterion 3: creation and viewing are free). **Change the
post-create redirect from `/trip/[id]/invite` to `/trip/[id]`** — land
directly on the trip dashboard, not the invite screen. Reaching invite
now happens by the organizer tapping "Invite" from the dashboard
(existing `PeopleIcon` icon button, already present in
`src/app/trip/[id]/page.tsx`) — once verified. **Revision (this pass):**
the previous version of this sentence described tapping "Invite" as
itself the mutation trigger (landing on the invite screen first, gating
on Copy/Share). That no longer holds — per §4 below, the roster/"Invite"
icon button (along with Add expense and Settle up) is not shown at all
while the organizer's session is unverified. So immediately after
creation, an organizer with a brand-new anonymous session sees their trip
(unchanged) plus the shared inline verification section in place of
those three entry points, from the very first paint of the dashboard —
not a state that only appears after they attempt something. See §4.

---

## 4. Hide-until-verified + inline OTP — organizer (mutation gate)

**Rewritten this pass (Decisions 12 and 13).** The previous design in
this section (an "attempt the action, land on the real screen, gate on
submit, redirect to `/check-email`, resume after confirm" pattern) is
**dropped entirely for the organizer**. It is replaced by hiding the
mutating entry points outright and gating all of them behind one shared
inline verification widget that lives on `/trip/[id]` itself. This
section applies **only** to the organizer's own trip. The invitee's
attempt-then-redirect-then-resume pattern (§6) is unchanged — see
Decision 12's explicit carve-out.

### 4.0 What's hidden, and when

While the organizer's session is **unverified** (anonymous, never
confirmed an email) and owns the trip being viewed, the trip dashboard
(`/trip/[id]`) hides, completely and exhaustively (Decisions 11, 13):

- **Add an expense** — the `BottomBar`'s primary button (today's
  `LinkButton href="/trip/${id}/add-expense"`, "Add an expense"). Not
  rendered at all; not reachable by URL guessing either (an unverified
  owner hitting `/trip/[id]/add-expense` directly must itself redirect
  back to `/trip/[id]` — an architecture/routing concern, flagged here
  because it's implied by "not reachable by any route").
- **Trip roster / Invite** — the `PeopleIcon` icon button in the top
  action row (today routes to `/trip/[id]/invite`). Hidden, along with
  the invite screen and everything reachable only from it (placeholder
  add/rename/remove).
- **Settle up** — the `ArrowsLeftRightIcon` icon button in the top action
  row (today routes to `/trip/[id]/settle-up`). **Newly added this pass**
  (Decision 13) — the earlier design never gated this button at all, and
  `complete_trip` had no anonymity guard server-side either; both gaps
  are closed together (this doc covers the UI half, architecture.md/the
  migration covers the RPC half).

**Not hidden** (not mutations of this trip, per Decision 2/11's
exhaustive list): the "New trip" (`PlusIcon`) icon, which starts a
*different* trip entirely, and "Send feedback" (`MessageSquareIcon`),
which doesn't touch trip data. Both stay visible and enabled regardless
of verification state, same as today.

Everything above them — the trip summary `Card` (name, dates, avatar
stack, Total/Avg, "You've paid"/"You'd owe" rows) and `TripTabs`
(Expenses list, Details tab) — renders exactly as it does for a verified
owner. Per Decision 6/criterion 3, an owner's own view is never gated,
verified or not, so nothing above the action row changes.

### 4.1 The shared inline verification section

In place of the three hidden entry points, the trip page renders **one**
persistent section — not three, not one per action, since a single
verification unlocks all of them simultaneously (per the task framing:
"don't design a fourth separate copy of this UI"). Layout:

- **Placement**: as a `Card`-styled block (reuse the same visual
  treatment as the existing "Want the full expense list?" CTA card in
  §5's `TripSummaryOnly` — `oklch(0.95 0.04 88)` background,
  `rounded-[20px]`, `p-4` — this app already has a "helper/CTA block"
  visual language, reuse it rather than inventing a second one),
  positioned directly below the trip summary `Card` and above `TripTabs`.
  This keeps it un-missable on first paint without requiring a scroll,
  while leaving the summary card (always-visible per Decision 6) as the
  first thing on the page, unchanged.
- **`BottomBar`**: not rendered at all while unverified. Today's
  `BottomBar` only ever holds the "Add an expense" button (or the locked-
  trip message) — with that button hidden, there is nothing that belongs
  in a sticky bottom bar for this state, and duplicating the same inline
  widget in two places on one screen would contradict "one shared
  section." (If the trip is *also* completed/locked while unverified —
  an edge case, since `complete_trip` itself requires verification per
  Decision 13, so this can only happen if a trip was completed before
  this feature shipped — the locked-message `BottomBar` is a view-only
  notice, not a mutation entry point, and may still render under the
  same rule as the top icons: it's not on Decision 2/11's list.)
- **Top icon row**: reduces to just "New trip" and "Send feedback" (plus
  the "All trips" back-chevron) while unverified — see §4.0.

The card itself has two sub-states, in place, no navigation:

**Sub-state A — email entry (default while unverified):**

- Copy (reuses the exact line from requirements.md step 4/AC6 — this is
  the one generic headline for all four gated actions, replacing the old
  per-trigger headlines from the dropped design):
  > **"Confirm your email to start adding expenses or inviting others."**
- Below it, the same `Field` + `Button variant="accent"` pattern used
  everywhere else in this app for email entry (`/`'s old form,
  `/check-email`'s email phase, §6's invitee trigger): label "Your
  email", placeholder `you@email.com`, prefilled from
  `remember-signin-email` if present with the same "Not you? Clear"
  affordance.
- Button: **"Send me a sign-in code"** (unchanged copy — same mechanism,
  same recognition value for a returning-ish user).
- *Loading*: button label becomes **"Sending…"**, disabled — same pattern
  as `/check-email`.
- *Invalid email*: reuse `friendlyAuthError` mapping, inline under the
  field, `text-terracotta` 13px — no new copy.
- *Network failure sending the code*: reuse the existing catch-block copy
  verbatim: **"Couldn't send a sign-in code — try again."** (same string
  already used in `/join/[code]`'s `handleJoin` and in `/check-email`).
  The card stays in this sub-state; button returns to normal so they can
  retry.

**Sub-state B — code entry (after the email send succeeds):**

- The card swaps its contents in place (no card-level animation needed
  beyond whatever the app already uses for similar in-place swaps — this
  is a state change, not a navigation). New microcopy needed for this
  moment, modeled on `/check-email`'s existing "We sent a 6-digit code
  to **{email}**. It works once, and it expires in 60 minutes." pattern,
  shortened to fit an inline card rather than a full screen:
  > **"We sent a code to {email}. Enter it below."**
  (Keep the "works once / expires in 60 minutes" detail available as a
  tooltip-free plain continuation if space allows —
  `"We sent a code to {email}. It expires in 60 minutes — enter it
  below."` — either wording is acceptable; pick whichever fits the
  card's width without wrapping past two lines. Both reuse the existing
  screen's tone rather than inventing new phrasing.)
- Code `Field`: same numeric, 6-digit, `tracking-[0.3em] text-center`
  styling as `/check-email`.
  - Button: **"Confirm code"** (unchanged copy).
  - *Loading*: **"Confirming…"**, disabled — same pattern.
  - *Wrong code*: reuse `friendlyAuthError(error)` inline under the code
    field — same mapping and copy `/check-email` already shows for this
    case, unchanged.
  - *Expired code*: same — `friendlyAuthError` already covers this;
    reuse verbatim. The existing "Resend code" affordance (below) is the
    recovery path, exactly as today.
  - *Network failure verifying*: reuse verbatim: **"Couldn't confirm
    that code — try again."**
- Resend row: identical mechanics/copy to `/check-email` — countdown
  **"Resend code (0:47)"** while `secondsLeft > 0`, **"Resend code"**
  once it elapses, transient **"Code sent"** confirmation on tap (the
  existing `justResent` pattern), and a resend-specific network-failure
  message reusing the existing **"Couldn't resend — try again."** copy.
  No new copy needed here.
- **"Use a different email"**: unlike `/check-email` (where this
  navigates back via `router.push(back)`), here it's a local state
  transition — flips the card back to sub-state A, keeping whatever
  email was typed so it can be edited rather than navigating anywhere
  (there is nowhere to navigate to or from; this is one screen
  throughout).

### 4.2 The confirmation moment

Deliverable 3 asks explicitly what changes on screen the instant the
code verifies. Design: a **brief inline success state, then the buttons
appear** — not an instant jump-cut, and not a separate screen:

1. `confirm()` (the same `verifyOtp` call `/check-email` already makes,
   using the `is_anonymous` branch to `type: "email_change"` per the
   existing implementation) resolves successfully.
2. The card swaps one more time, briefly (roughly 800ms–1200ms, matching
   the existing `justResent` "Code sent" transient-message duration
   already used on this same screen's resend flow, so this reuses a
   timing convention rather than inventing one), to a short success
   state inside the same card shell: a checkmark glyph plus **"You're
   verified."** No new visual language — same card, same corner radius,
   just its content.
3. After that brief window, the card unmounts and the previously-hidden
   entry points reappear: the top icon row regains the roster/Invite and
   Settle-up icons, and the `BottomBar` regains the "Add an expense"
   button — fully enabled immediately, no further gate, per AC8.
4. **Architecture note surfaced by this design, not a UX decision on its
   own**: because `/trip/[id]` is a server component that decides what
   to render based on whether `getTripView`'s caller is verified, the
   inline widget's client-side "success" moment and the server actually
   seeing the upgraded session are two different points in time. The
   success state in step 2 doubles as visual cover for a
   `router.refresh()` (or equivalent re-fetch) triggered right after
   `confirm()` resolves, so the button row that reappears in step 3 is
   the real server-rendered one (backed by actual RLS-visible
   verification), not a client-only optimistic guess that could
   momentarily show buttons the backend would still reject. If the
   refresh takes longer than the success-state window, keep the success
   state visible (don't reveal a stale/incomplete row) rather than
   showing a flash of hidden buttons.

### 4.3 Resuming intent — no longer applicable for the organizer

Deliverable 5. The old §4 (dropped above) had a "Resuming intent
(organizer)" subsection describing how to preserve an in-progress
add-expense draft or invite/share action across the redirect-to-
`/check-email`-and-back round trip. **That subsection is removed, not
merely edited**, per Decision 12 and the Non-goals entry it backs: since
the organizer can no longer reach the add-expense form, the invite
screen, or the settle-up action at all before verifying, there is no
draft, no in-progress form state, and no pending action to resume —
verification now happens strictly *before* any of those screens become
reachable, not partway through filling one out. This is a deliberate
simplification, not an oversight: it removes an entire mechanism
(session-storage-held drafts, resume-target query params) that the
previous design needed and this one doesn't.

This carve-out is scoped to the organizer only. The invitee's existing
resume-after-redirect design (§6.1 — e.g. resuming into
`/trip/[id]/add-expense` with whatever was typed preserved, or landing
on the Details tab after a "See full details" tap) is **unchanged** and
still applies exactly as designed, since an invitee can still reach
those screens first and get redirected mid-attempt, unlike the
organizer.

---

## 5. Invitee: trip summary (public, zero-auth)

Opening `/join/[code]` today shows a "type your name + email to join"
gate before any trip content is visible. That gate is replaced: the
invite link now opens directly onto a **summary view of the trip**, with
no form, no auth, styled as a first-class "final answer" screen per
`docs/v2-vision.md`, not a teaser.

### Screen shape

Reuse the trip dashboard's card layout (`src/app/trip/[id]/page.tsx`'s
top `Card` — trip name badge, dates, avatar stack, Total/Avg-per-person,
divider) almost verbatim, because that card already *is* the "final
answer" surface: total spent, average per person. What it must **not**
include for a non-owner, no-session visitor is:

- The "You've paid so far" / "You'd owe" rows (these require knowing
  *which* member the viewer is — undefined pre-verification).
- The Expenses/Details tabs and their line-item list (`TripTabs`) — this
  is exactly the gated tier.
- The icon-button row for Add/Invite/Settle-up/Feedback (all mutations
  or owner actions).

What it **should** show instead, so the summary reads as complete rather
than stripped-down:

- Everything the top summary `Card` already shows: trip name, badge,
  dates/location, avatar stack + people count, **Total so far**, **Avg /
  person**.
- A **per-person who-owes-whom line**, if the data model can compute it
  without exposing line items (it can — it's an aggregate over the same
  expense rows, not the rows themselves): this is the actual "Alex owes
  Sam $42" moment v2-vision.md calls out, and it belongs in the public
  tier precisely because it's a summary number, not a detail. Present it
  as a short list beneath the Total/Avg row, in the same visual language
  (Kicker + `text-display` amounts):
  > Kicker: "Who owes who" \
  > Row: "Alex owes Sam" — "$42.00" (repeat per settle-up pair; reuse
  > whatever aggregate the existing settle-up screen
  > (`/trip/[id]/settle-up`) already computes, since that screen already
  > solves this exact math for the owner's view).
- A clear, non-apologetic call to action for going further — this is the
  moment that frames the next tier as a feature, not a wall:
  > Card or banner, `oklch(0.95 0.04 88)` background (same treatment used
  > elsewhere for "helper" info blocks):
  > **"Want the full expense list?"** \
  > "See exactly what was spent and add your own — just confirm your
  > email." \
  > Button: **"See full details"**

### Copy for the summary screen header

Since there's no "type your name to join" step anymore before this
renders, the organizer-name framing currently in `/join/[code]`'s hero
banner ("Sam invited you") is worth keeping — it's a nice trust signal
and costs nothing to keep public:

> Hero strip (reuse the existing accent-colored banner from
> `/join/[code]`): avatar-initial chip + **"{Organizer} invited you"**,
> trip name as the big `text-display` line, dates/location beneath.

### States

- *Loading*: reuse the existing "Loading trip…" pattern
  (`ScreenContent` + `text-ink/70`, as seen in `/trip/[id]/invite`'s
  loading branch) — no new spinner design needed.
- *Invalid/expired invite code*: reuse today's exact copy from
  `/join/[code]`'s `loadError` branch: **"This invite link doesn't match
  a trip anymore."** No change needed.
- *Network failure loading the summary*: same tone as other screens'
  failure copy: **"Couldn't load this trip — check your connection and
  try again."** with a retry button (new — today's equivalent screens
  don't offer one because they're one-shot flows; here the visitor has
  no other path in, so a retry affordance matters more). Button: **"Try
  again"**, re-fetches.

### Note on `/join/[code]/welcome`

This screen (the ordinal "You're on the trip, {name}" celebration) only
makes sense *after* someone has actually joined as a named member, which
under the new model happens at OTP verification, not before. Keep this
screen, but move its trigger to fire after the OTP step for an invitee
who verifies from the summary view (see §6) rather than after the old
pre-auth name+email form. Copy is unchanged.

---

## 6. Invitee: detail-view / write gate

Triggered by either:

- Tapping **"See full details"** on the summary screen (§5), or
- (if the summary screen also exposes a lightweight "Add an expense"
  affordance for invitees — reasonable to include per "this should feel
  like a legitimate view," e.g. a secondary button under the CTA
  card) tapping **"Add an expense."**

Both route to the same OTP step. Copy names whichever was tapped, per
requirements.md's exact tiering (one confirmation unlocks both):

- Triggered by "See full details": headline **"Confirm your email to see
  the full expense list."**
- Triggered by "Add an expense": headline **"Confirm your email to add
  an expense."**

Sub-copy (either trigger, shown once under the headline, sets
expectations for what verifying grants — this is where the "unlocks both
at once" decision becomes reassuring rather than confusing):

> "You'll be able to see every expense and add your own — {trip name}
> keeps your email just to know it's you next time."

This reuses the exact same email-entry-then-`/check-email` shape as §4.1
— same `Field`, same button copy, same OTP screen. The only thing that
differs from the organizer path is the headline/sub-copy and what
happens after (§6.1), not any new mechanism.

### 6.1 After verification (invitee)

- If triggered from "See full details": land on `/trip/[id]` with the
  Details tab already selected (reuse `TripTabs`'s existing tab state,
  just default it to `"details"` for this landing instead of
  `"expenses"` — a one-prop change, not a new component) — this is the
  full line-item list they asked for, no extra tap needed to find it.
- If triggered from "Add an expense": resume directly into
  `/trip/[id]/add-expense` with whatever they'd started typing preserved
  (same resume-intent mechanism as §4's organizer add-expense case).
- Either way, this is also the moment `/join/[code]/welcome`'s
  celebration content becomes appropriate (§5 note) — consider firing it
  once, on first verification for a given trip, before landing on the
  resumed target; this is a nice-to-have sequencing detail, not a
  blocker, since requirements.md doesn't mandate it and Non-goals
  emphasizes not over-building here.

---

## 7. Returning visitors (`/`, session-aware routing)

Not a new screen — a routing behavior layered on `/`. Documented here for
completeness of states since it changes what a visitor sees at the same
URL depending on session state.

| Session state | What they see at `/` |
|---|---|
| No session (fresh browser) | Welcome screen, §2 |
| Anonymous session, owns exactly one trip | Routed straight into that trip (`/trip/[id]`) — no welcome screen, no prompt |
| Anonymous session, owns 0 trips (shouldn't normally happen, but e.g. a cleared-then-restored partial state) | Welcome screen, §2 — same as no session, since there's nothing to route into |
| Verified session, 1 trip/membership | Routed straight into that trip |
| Verified session, 2+ trips/memberships | Routed to `/trips` (existing screen, unchanged — criterion 15) |

No loading-state copy is needed beyond what's noted in §2 (avoid a flash
of welcome content before the redirect fires).

---

## 8. Sign-in-by-code entry point for "no browser memory"

Per criterion 15, a returning visitor with no local session needs the
existing email+OTP sign-in flow as their way back in — but `/` no longer
shows an email field by default. This flow needs a discoverable entry
point that isn't the welcome screen's primary action (which is now
"Create your first trip," and criterion 4 says that copy must not imply a
one-trip limit or hide the fact that returning users have another path).

**Add a small secondary link on the welcome screen**, beneath the
existing "I have an invite link" ghost button, same visual weight/style:

> **"Already have a trip? Sign in"**

Tapping it routes to the same email-entry pattern as §4.1 option 1 (or,
simplest, reuses `/` itself, but with a `?signin=1`-style flag that swaps
the welcome content for the old email `Field` + "Send me a sign-in code"
button) → `/check-email` (unchanged) → lands on `/trips` (criterion 15;
`/check-email`'s existing `next` default of `/trips` already does this
with zero code change).

This is the one net-new navigational affordance on the welcome screen
beyond swapping the primary action — everything else on `/` either stays
identical (secondary "I have an invite link" button, stat strip) or is
removed (email field, primary "send code" button).

---

## 9. Error / edge states — consolidated

Most reuse existing copy verbatim; listed together here for QA
traceability.

| State | Where it can occur | Copy |
|---|---|---|
| Invalid email format | Organizer's inline widget on `/trip/[id]` (§4.1 sub-state A); invitee email-entry step on `/check-email` (§6, §8) | Reuse `friendlyAuthError` mapping — no new copy needed; existing `/` behavior already handles this via Supabase's own validation error surfaced through `friendlyAuthError`. |
| OTP code wrong | Organizer's inline widget, sub-state B (§4.1); `/check-email` for invitees (unchanged) | Existing `friendlyAuthError(error)` inline message under the code field — unchanged copy, now also surfaced inline on the trip page for the organizer case. |
| OTP code expired | Organizer's inline widget, sub-state B (§4.1); `/check-email` for invitees (unchanged) | Existing `friendlyAuthError(error)` — unchanged; existing resend affordance ("Resend code") already covers recovery in both places. |
| Resend cooldown | Organizer's inline widget, sub-state B (§4.1); `/check-email` for invitees (unchanged) | Existing countdown copy: "Resend code (0:47)" — unchanged. |
| Network failure sending code | Organizer's inline widget, sub-state A (§4.1); invitee email-entry step on `/check-email` (§6, §8) | Existing catch-block copy pattern: "Couldn't send a sign-in code — try again." (already used in `/join/[code]`'s `handleJoin` catch) — reused verbatim inline for the organizer, and on `/check-email` for invitee triggers. |
| Network failure verifying code | Organizer's inline widget, sub-state B (§4.1); `/check-email` for invitees (unchanged) | Existing: "Couldn't confirm that code — try again." |
| Network failure creating trip | `/trip/new` (unchanged) | Existing: "Couldn't create the trip — try again." |
| Network failure starting anonymous session on trip creation | `/` → create action (new) | "Couldn't start your trip — check your connection and try again." (§2) |
| Network failure loading public summary | `/join/[code]` summary view (new) | "Couldn't load this trip — check your connection and try again." + "Try again" button (§5) |
| Invalid/expired invite code | `/join/[code]` (unchanged) | Existing: "This invite link doesn't match a trip anymore." |
| Trip is locked, tries to add expense | `/trip/[id]/add-expense` (unchanged) | Existing: "This trip is locked — the organizer already settled it up, so no more expenses can be added." — this check happens regardless of auth tier and is unaffected by this feature. |
| Attempted direct API access without required tier (server-side reject, no UI page) | RPC/API layer, not a screen | Not a UI concern — architecture must ensure the failure is a clean auth/permission error, not a crash; no user-facing copy needed since this path isn't reachable through the app's own UI at all (criterion 17 is about the API contract, not a screen). |
| Empty state: trip has no expenses yet | `/trip/[id]` Expenses tab (unchanged) | Existing: "No expenses logged yet." — applies equally whether viewer is owner or verified invitee. |
| Empty state: no trips yet | `/trips` (unchanged) | Existing: "You're not on any trips yet." + "Start a trip" button. |

---

## 10. Copy reference (new/changed strings only)

For quick implementation lookup — everything not listed here is reused
byte-for-byte from the current implementation.

**Welcome (`/`):**
- Subhead: "Add what you spend. We'll work out who owes who — no account
  needed to start."
- Primary button: "Create your first trip"
- New secondary link: "Already have a trip? Sign in"

**Organizer inline verification widget (`/trip/[id]`, §4 — rewritten this
pass; supersedes the old per-trigger headlines below the old §4.1, which
no longer apply since the organizer's trigger is no longer route-based):**
- Sub-state A (email entry) headline — one shared line for all four
  gated actions, not per-action: "Confirm your email to start adding
  expenses or inviting others."
- Sub-state A button: "Send me a sign-in code" (unchanged)
- Sub-state B (code entry) transition copy: "We sent a code to {email}.
  Enter it below." (or the "It expires in 60 minutes" variant — see
  §4.1)
- Sub-state B button: "Confirm code" (unchanged)
- Confirmation-moment success copy: "You're verified." (brief, ~1s,
  before the buttons reappear — see §4.2)

**Invitee summary screen (`/join/[code]`):**
- CTA card heading: "Want the full expense list?"
- CTA card body: "See exactly what was spent and add your own — just
  confirm your email."
- CTA button: "See full details"
- Section kicker: "Who owes who"

**Invitee OTP trigger, email-entry step:**
- Detail-view trigger headline: "Confirm your email to see the full
  expense list."
- Add-expense trigger headline: "Confirm your email to add an expense."
- Shared sub-copy: "You'll be able to see every expense and add your
  own — {trip name} keeps your email just to know it's you next time."

**New error copy:**
- "Couldn't start your trip — check your connection and try again."
  (welcome screen, anonymous session/trip creation failure)
- "Couldn't load this trip — check your connection and try again." +
  "Try again" button (public summary load failure)

---

## 11. Explicitly out of scope for this doc

Per requirements.md's Non-goals, this design does not introduce: a
"who are you?" identity picker, any visual redesign of the landing page
beyond swapping its primary action, a multi-trip management UI richer
than the existing `/trips` list, or any account-recovery flow/copy for an
organizer who never verifies (criterion 16 — deliberately no warning
copy is added anywhere in the create-trip flow about this; adding one
would be scope creep against a decision that's already locked).
