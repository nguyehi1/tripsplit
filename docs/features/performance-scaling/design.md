# Design: performance-scaling

## Scope of this doc

This is a `Fix` — no new capability, no behavior change, latency only (see
requirements.md's semver classification and non-goals). Per the brief for
this stage, the UX work here is intentionally narrow:

1. Are there loading/skeleton/optimistic-UI states worth adding so perceived
   latency improves even before Phase 2 ships, or in cases where Phase 1
   finds an unavoidable cost (e.g. a cold start)?
2. Is any user-facing indication needed if a p95 target isn't met?
3. Do any of the likely Phase 2 mechanisms risk a visible behavior change
   that would need a state/copy update — in particular around the
   summary-vs-detail tiering on `/trip/[id]`?

This doc answers all three. It does not propose new screens, new visual
components, or any change to what data is shown where — that's explicitly
out of bounds per the requirements (no change to tiered visibility, no new
caching, no behavior change on any of the three surfaces).

No mockup was produced. Everything below is a small addition to existing
text-based loading states plus a set of constraints for the architect/
engineer stages — there's no new layout or visual pattern that a mockup
would clarify better than the copy and thresholds spelled out here.

## Grounding: how the app currently handles "waiting"

Read `src/app/loading.tsx`, `src/app/trips/loading.tsx`,
`src/app/trip/[id]/loading.tsx`, `src/app/error.tsx`,
`src/app/join/[code]/page.tsx`, `src/app/trip/[id]/add-expense-sheet-content.tsx`,
and `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx`. Two conventions
are consistent across all of them, and matter for what follows:

- **No spinners, no skeleton screens, anywhere in the codebase.** Every
  loading state today is a single calm line of text
  (`text-[15px] text-ink/70`) — "Loading your trips…", "Loading your
  trip…", "Loading trip…", "Loading expense…", "Adding…", "Saving…". This
  is a deliberate, consistent visual language, not an oversight. Introducing
  a skeleton loader or spinner for this feature would be a new visual
  pattern bolted onto an app that has never used one — inconsistent with
  every other screen, and out of proportion for a pure latency fix.
- **States resolve atomically, not progressively.** `/trip/[id]` waits for
  both `getTripSummary` and (if a session exists) `getTripView` before
  rendering anything beyond "Loading your trip…" — there's no partial
  reveal today. `/join/[code]` waits for the invite lookup *and* the
  summary fetch before showing the invite card. `/trips` waits for all
  three of `getMyTrips`'s queries before showing any trip row. Add-expense
  is the one exception: the form itself renders immediately, with only the
  "Splits N ways" pill using `memberCount ?? "…"` as an inline, self-
  resolving placeholder while the gating fetch runs in the background.

Both conventions should be preserved. The recommendations below add one
small, consistent piece — a delayed reassurance line — without introducing
skeletons, spinners, or progressive/partial rendering.

## (a) Loading states: what's worth adding

**Recommendation: a delayed "still loading" second line, added to the four
blocking loading states, nothing else.**

Today, if a load is slow — including the case Phase 1 might find is
genuinely unavoidable, like a cold Vercel function start — the user sees
"Loading your trip…" (or equivalent) indefinitely, with no signal that
anything is different from a fast load in progress. That's the one real gap:
it costs nothing to add, it directly helps the "Phase 1 finds this is a cold
start and there's no more juice to squeeze" case, and it doesn't touch data-
fetching logic at all — it's presentational only, so it's safe to add
independent of whatever Phase 2 finds.

Apply the same treatment to all four existing blocking-loading states:

| Surface | File | Primary line (unchanged) |
|---|---|---|
| `/trips` | `src/app/trips/loading.tsx` | "Loading your trips…" |
| `/trip/[id]` | `src/app/trip/[id]/loading.tsx` | "Loading your trip…" |
| `/join/[code]` | `src/app/join/[code]/page.tsx` | "Loading trip…" |
| Edit expense | `src/app/trip/[id]/expense/[expenseId]/edit/page.tsx` | "Loading expense…" |

**New copy, identical across all four (one string, reused):**

> Taking a little longer than usual…

Shown as a second line beneath the existing primary line, only after a
delay — never on first paint. Visually quieter than the primary line (e.g.
smaller and lighter, so it reads as a gentle aside, not an alarm or a
progress indicator). No spinner, no percentage, no countdown — consistent
with the rest of the app never showing one.

**Threshold: default to 4 seconds, but treat this as provisional.** There's
no baseline data yet (that's what Phase 1 produces). Once p50/p95 numbers
exist per surface, the threshold should sit between them — comfortably above
what a normal load feels like (so most users never see it) and comfortably
below what would otherwise read as a silent hang. If Phase 1's baseline
shows, say, p50 of 600ms and p95 of 3.5s on some surface, 4s is probably
right; if a surface's p95 is 8s, 4s would make most slow-but-normal loads
show the message, which dilutes it. **Flag for whoever picks up Phase
1: revisit this threshold per-surface once real numbers exist, rather than
shipping 4s everywhere by default.**

**Deliberately not recommending:**
- A retry/cancel button at this threshold. That already exists as a
  *post-failure* affordance (`/join/[code]`'s "Try again" button, shown only
  once `loadError` is set) — adding one earlier, while the request might
  still succeed, would imply the load has failed when it hasn't.
- Any change to add-expense's form-renders-immediately pattern. It already
  does the right thing (show usable UI, let the one dependent value resolve
  in place) — no delayed-message treatment needed there since nothing is
  fully blocked.

## (b) User-facing indication if a p95 target isn't met

**No.** Confirming this rather than guessing, per the brief.

The ≥30% p95 reduction target (requirements.md AC5) is an internal
engineering bar for verifying the fix worked — it was never a promise made
to users, and Splitiful has no SLA/status-page concept anywhere in the
product today. Surfacing "we didn't hit our performance target" to users
would be:
- A new user-facing capability (a status/meta-message the app has never
  shown before) on a feature classified as a pure `Fix` — direct scope
  creep against the classification in requirements.md.
- Actively counterproductive: it draws attention to slowness rather than
  just handling it gracefully, which is what the (a) treatment above
  already does regardless of whether the underlying target is eventually
  met.

The one adjacent case worth flagging: if Phase 2 finds a surface truly
cannot be fixed (e.g., an unavoidable cold start with no further headroom),
requirements.md's AC already covers that ("baseline data and reasoning for
'not a real bottleneck' is recorded, not silently dropped") — that's a
docs/engineering record, not a user-facing message. The delayed-reassurance
copy in (a) is the only user-facing accommodation for that case, and it's
already scoped to look identical whether or not a fix ever lands — it just
says the load is slow, not why.

**One thing to flag, not decide here:** if a Phase 2 mechanism introduces an
actual timeout (client- or server-side) that turns "still loading" into an
explicit failure before the request would have naturally resolved, that
*is* a new failure mode and needs its own error copy — it would not be
covered by the reassurance line above, which assumes the request is still
in flight. Nothing in requirements.md asks for a timeout, and none of the
current code has one, but if the architect/engineer stage adds one as part
of a fix (e.g., "give up and show an error after 15s so a cold function
doesn't hang the tab forever"), that needs a design decision — surfacing it
here rather than assuming the generic error copy already in `error.tsx`/
each page's `loadError` state silently covers it.

## (c) Sanity-check: could a Phase 2 fix visibly change behavior?

Requirements.md is explicit that the summary-vs-detail visibility tiering
on `/trip/[id]` must not change (AC, non-goals). Read literally that's about
*who can see what*, which Phase 2 isn't touching (RLS/access logic is
untouched by a latency fix). But there's a related risk one level down: **a
verified member could be shown the summary-only view, even briefly, purely
as a rendering side effect of how a fix is implemented** — which today never
happens for a member (the page only ever resolves to the summary view when
`getTripView` genuinely comes back null for that caller, i.e. they're not a
verified member). That's a real, distinct risk from the access-control one
the requirements already cover, so it's worth spelling out explicitly:

**Safe direction — flag as the recommended shape, not prescribing
implementation:** running `getTripSummary` and `getTripView` concurrently
(e.g. `Promise.all`) instead of sequentially, then rendering once both
settle, exactly as today. This removes one avoidable round trip with **zero
visible change** — same atomic "nothing, then everything" rendering,
same result either way.

**Risky direction — flag explicitly for architect/engineer, do not do this
without a design decision first:** using React Suspense / streaming to
render the `TripSummaryOnly` tier immediately while `getTripView` resolves
in the background, then swapping to the full-detail view once it arrives.
This is a plausible-looking Phase 2 optimization (it would make the page
*feel* instant), but for a verified member it would mean:
- Briefly showing the "Want the full expense list? … just confirm your
  email" upsell card and email-verification CTA to someone who is already a
  fully verified member with nothing left to confirm — which reads as a
  bug/broken state, not a loading affordance, since the summary tier's copy
  is written for an unverified visitor, not a member mid-load.
- A distinct new UI state (flash-then-swap) that doesn't exist anywhere
  else in the app today, on the single most-visited surface, without any
  written design for how the swap should look or feel.

**If this direction is pursued, it needs to come back through design as its
own decision** — not shipped as an incidental side effect of a performance
fix. The lower-risk alternative (parallelize the two calls, keep the single
atomic render) achieves the same latency win without this problem, so it
should be the default assumption unless Phase 1 finds a reason that alone
isn't enough.

**Other surfaces, checked for the same class of risk:**

- **`/join/[code]`**: today's two calls (`/api/trip-invite/[code]`, then
  `getTripSummary`) are a genuine dependency chain, not an avoidable
  sequential round trip — the summary fetch needs the trip id the invite
  lookup returns. If Phase 2 collapses these into one round trip (e.g. the
  invite RPC/route returning summary data directly), that's invisible to
  the user as long as the invite card still renders as one atomic unit, the
  same way it does today. **Flag:** if instead a partial reveal is used
  (header card first, totals/settlements filled in after), that's a new
  visible pattern that doesn't exist today and would need its own design —
  don't assume it's covered by this doc.
- **`/trips`**: `getMyTrips` already parallelizes two of its three queries;
  further parallelizing is invisible the same way, as long as trip rows
  still appear all at once rather than streaming in one-by-one. Per-row
  progressive reveal would be a new visible list-loading pattern — flag if
  considered, don't assume it's pre-approved by this doc.
- **Add/edit-expense**: the likely Phase 2 fixes here are round-trip/
  transition-cost reductions (e.g. avoiding a redundant client round trip,
  trimming the `router.refresh()` cost), not query changes. **Explicitly
  recommend against** using this as an opportunity to introduce optimistic
  UI (e.g. showing the new expense in the list before the server confirms
  it) as part of this feature — that would be a new interaction pattern
  with its own failure-state design burden (what does it look like when an
  optimistically-shown expense fails to save and has to disappear?), which
  is exactly the kind of new user-facing capability this `Fix` is scoped to
  avoid. Keep the current submit-then-wait-then-navigate shape; just make
  each step faster.
- **Pre-existing, unrelated to this feature, but touched by the same code
  paths — flagging so it isn't accidentally made worse:** `add-expense`'s
  gating fetch (auth + member count + trip lock status) currently renders
  the editable form *before* that fetch resolves, so a locked trip can
  briefly show a fillable form that then gets replaced by the "trip is
  locked" screen once the fetch completes (losing any input typed in the
  meantime). `edit-expense`'s equivalent fetch blocks the form until it
  resolves, so it doesn't have this issue. This inconsistency predates this
  feature and isn't in scope to fix here, but if Phase 2 touches this
  shared gating logic while reducing round trips, it should preserve each
  screen's current behavior exactly rather than incidentally changing which
  one races — that's a correctness/UX regression risk worth a QA check, not
  a silent side effect of a latency fix.

## Summary

- One small, additive change recommended: a delayed "Taking a little longer
  than usual…" second line on the four existing blocking loading states,
  using the same plain-text convention the app already uses everywhere —
  no skeletons, no spinners, no new visual language.
- No user-facing indication for a missed p95 target — that's an internal
  engineering bar, not a user-facing promise, and adding one would be scope
  creep on a `Fix`.
- The one Phase-2 direction that would visibly change behavior — streaming/
  progressive rendering of `/trip/[id]`'s summary tier ahead of the detail
  tier — is flagged as something that needs to come back through design if
  pursued, not something this doc pre-approves. The lower-risk alternative
  (parallelize the two fetches, keep the atomic render) gets the same
  latency benefit without that problem.
- Two smaller flags for whoever implements: the reassurance-line threshold
  (4s default) should be revisited per-surface once Phase 1's baseline
  exists; and any new timeout-driven failure state would need its own copy,
  not an assumed fit with existing error copy.

Beyond the above, there is genuinely no new UX design work required by this
feature — it is a latency fix with no behavioral or visual change, and the
existing screens, empty states, and error copy for all three surfaces are
unaffected and correctly stay as they are.
