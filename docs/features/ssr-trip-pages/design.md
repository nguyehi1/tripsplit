# Design: Server-render the trips list and trip dashboard

Scope reminder: per requirements.md this is a **zero-visual-change performance
refactor**. No new screens, no copy changes, no redesign. This doc exists
because the *mechanism* for loading/error states necessarily changes when the
page moves from "render placeholder → client fetch → swap" to "server
fetches, then sends real HTML" — and that mechanism shift needs to be
specified precisely enough that engineering doesn't improvise something that
looks or feels different. No mockup is attached; there's nothing new to
visualize, only existing states to re-home.

No `design` skill mockup was produced — this refactor introduces no new
visual surface, so a mockup would document nothing beyond what's already
described below and in the current, unchanged UI.

## 1. What doesn't change (confirmed from current code)

These are locked by requirements.md and confirmed present in the current
implementation — call this out explicitly to engineering as the "must still
look pixel-identical" checklist:

| State | Current copy/behavior | Where |
|---|---|---|
| Trips empty state | "You're not on any trips yet." + "Start a trip" button (routes to `/trip/new`) | `src/app/trips/page.tsx` |
| Trip dashboard empty expenses | "No expenses logged yet." | `src/app/trip/[id]/page.tsx` |
| Locked trip badge | Pill with lock icon, text "Locked", terracotta color, shown when `trip.isCompleted` | same |
| Locked trip bottom bar | Muted button: "Trip is locked — no more expenses" (replaces "Add an expense") | same |
| Tab switch | `TabSwitch` between "Expenses" / "Details", default `"expenses"` | same |
| Expense row edit affordance | Pencil icon + click/keyboard nav to edit page, only when `expense.payer.id === you?.id && !trip.isCompleted` | same |

None of this changes. The design work below is scoped to loading and error
states only, plus flags on where server-rendering could *accidentally* change
what a user sees.

## 2. Loading states

### 2a. Initial/first-paint load (the case this refactor targets)

Per AC #1, the HTML response for `/trips` and `/trip/[id]` should arrive with
real data already in it. There is deliberately **no** "Loading your trip…"
render in the fast-network path anymore — that placeholder-then-swap is
exactly what's being removed. On a normal connection, the user sees nothing
before the real screen; that's the win.

### 2b. Slow-network fallback (new question this refactor raises)

Server-side data fetching still takes non-zero time, and on a slow
connection a user could sit on a blank/previous screen with no feedback,
which is worse than today's guaranteed-instant "Loading your trip…" text.
Next's `loading.tsx` mechanism (a Suspense boundary Next inserts
automatically around the route segment) is the right tool: it only renders
if the segment takes long enough to notice, so fast loads still show nothing,
but slow ones get feedback instead of a stall.

**Decision: give `/trips` and `/trip/[id]` their own `loading.tsx`, reusing
the exact current copy, rather than relying on the existing global
`src/app/loading.tsx`.**

- `src/app/trips/loading.tsx` → same markup as today's inline loading
  branch: `Screen` / `ScreenContent` (`pt-14`... actually match the page's
  own padding convention), `<p className="px-1 text-[15px] text-ink/70">Loading your trips…</p>`.
- `src/app/trip/[id]/loading.tsx` → `<p className="text-[15px] text-ink/70">Loading your trip…</p>` inside `Screen` / `ScreenContent` with `pt-14`, matching today's exact markup.

Rationale for not just using the existing generic global `Loading…`: that
copy is deliberately generic for arbitrary routes, but these two pages
already had specific, tested copy ("Loading your trips…" / "Loading your
trip…") that is closer to "visual output unchanged" than swapping to
something new. It costs two small files and keeps the fallback
indistinguishable from what's there today, just rarer.

Net effect versus today: same visual, strictly less frequent (only shows
under real latency, not on every navigation).

## 3. Error / "not a member" state — `/trip/[id]`

Current behavior (client): any failure in the `getUser()` → `getTripView()`
chain — not signed in, not a member (RLS denies the row), or a genuine
transient failure — gets caught and rendered as the same static line, no
retry, no navigation:

> Couldn't load this trip — you may not be on it.

(There's a second, effectively-dead branch — "Couldn't load this trip." for
non-`Error` throws — but in practice nearly everything thrown is an `Error`
instance, so real users only ever see the first message. Worth knowing, not
worth fixing here.)

**Decision: keep this as an inline render inside the page component, not
`notFound()` and not `redirect()`.**

- `notFound()` renders `src/app/not-found.tsx` ("Nothing here." / icon /
  "Go home" button) — different copy, different visual, would violate AC #4
  (preserve the existing message) and AC #7 (no visual change).
- `redirect()` would take the user away from the URL they navigated to,
  which is a bigger behavior change than today's "stay put, show a
  sentence" — not asked for, and arguably worse for someone who followed a
  stale/wrong link and wants to see *what* went wrong before deciding what
  to do next.
- Inline render matches today exactly: same `Screen`/`ScreenContent`
  (`pt-14`), same single paragraph, same copy, no button.

Mechanically (for engineering, not prescribing implementation): the page
needs to detect the "couldn't build a view" condition server-side —
`getTripView` throwing because the `trips` row lookup comes back empty under
RLS (not a member) or any other failure — and render the inline branch
instead of letting the error propagate to `error.tsx`. This preserves
today's actual behavior of collapsing "not a member" and "something broke"
into the same message.

**Flag for PM/eng — not resolving silently:** today's collapsing of "you're
not a member" and "a real backend error just happened" into one message is
already slightly wrong (a genuine Supabase outage currently looks
identical to a bad invite link), and it's *technically* preservable
as-is. But now that the fetch happens where a proper `error.tsx` boundary
(with an actual "Try again" retry) is available for free, it's worth asking
whether unexpected/transient errors (not "no such row") should instead be
allowed to bubble to `error.tsx` while only the specific "not a member /
row not visible" case gets the inline message. That would be a small,
arguably-positive behavior change (real outages get a retry button instead
of a dead-end sentence) rather than pure preservation, so it exceeds this
ticket's "no UX changes" framing as written. **Recommending we ship strict
preservation (one inline message for all failure modes, as today) in this
pass, and file the split as a separate, explicit follow-up** rather than
bundling a behavior change into a ticket classified as a no-user-visible-
change fix.

## 4. Error state — `/trips`

`/trips` has no "not a member" case (it queries "trips this user belongs
to," which is legitimately empty for a new user — that's the empty state,
not an error). The only failure mode is a genuine unexpected error (DB
down, network failure), currently shown as an inline `"Couldn't load your
trips."` in terracotta text.

**Decision: preserve as-is — inline message, no retry, matching current
copy and color exactly** (`text-[13px] text-terracotta`), for the same
"don't smuggle in a UX change" reasoning as above. If this fetch throws
server-side, that specific error should be caught in the page and rendered
inline rather than allowed to fall through to the generic `error.tsx`
("Something went wrong" / "Try again"), to avoid a visual change relative to
today.

**Flag, same shape as above:** using the generic `error.tsx` here (or a
route-scoped `src/app/trips/error.tsx` with matching copy + a "Try again"
button) would give users a working retry action, which today's dead-end
sentence doesn't. Worth a follow-up conversation, not part of this pass.

## 5. Interactive elements after the Server Component conversion

Tab switching (`TabSwitch`), icon-button navigation, and the clickable
expense/trip rows all require client-side interactivity (`onClick`,
`useState` for the active tab). Converting the pages to Server Components
means these need to live in a client boundary that receives server-fetched
data as props rather than re-fetching. This is an implementation detail for
architecture/engineering, but two things matter for the "feels identical"
bar:

- The client tab component's default state must be `"expenses"` on both
  server and client — if the SSR shell renders a different default (or none)
  than the client component hydrates with, that's a visible flash and a
  hydration warning in the console.
- All the data (trip, members, expenses, `you`) should be passed down as
  props from the server-fetched result, not re-derived or re-fetched
  client-side — re-fetching would reintroduce the very waterfall this
  refactor removes and could theoretically show slightly different data if
  it raced a concurrent edit.

## 6. Risks to watch for (engineering-facing, not mine to fix, but flagging)

**Timezone-dependent date formatting — real risk, please verify before
merge.** `formatDayDate`, `formatDate`, and `formatDateRange`
(`src/lib/dates.ts`) all do `new Date(iso + "T00:00:00").toLocaleDateString("en-US", ...)`
with no explicit `timeZone`, so they resolve to whatever timezone the
*executing runtime* is in. `formatDayDate` is called inside `getTripView`
itself (`src/lib/data/trips.ts:289`), and `formatDateRange`/`formatDate` are
called directly in the page JSX. Today all of this executes in the visiting
user's browser (local timezone). After this refactor it executes on the
server (commonly UTC in production). For any user not in UTC, an expense
logged near midnight in their local time could now render with a different
weekday/date label than it did yesterday — a real, silent visual change that
technically breaks "visual output unchanged" (AC #7) despite the refactor
otherwise being byte-for-byte invisible. Recommend explicit verification
(ideally: pin these formatters to a fixed timezone convention, or confirm
product is fine with dates always being interpreted in a fixed zone
regardless of viewer) before this ships — this is a product decision
(which timezone should "today"/"day" mean for a trip?), not something to
default silently either direction.

**Hydration mismatch generally.** Anything rendered differently between the
server pass and the client hydration pass will produce a visible flash and
a React hydration warning. Given the data here is static once fetched (no
`Math.random()`, no `Date.now()` in the render path, `avatarColorFor` is
deterministic by index) this should be low-risk *except* for the timezone
issue above and the tab-default issue in section 5.

**One-time swap when the slow-network `loading.tsx` fires.** If a
`loading.tsx` fallback does show (see 2b), there will be exactly one visual
swap from the loading text to the real content once the server response
lands — this is expected, matches today's one-swap behavior, and should not
be treated as a bug.

**Auth-state consistency between `proxy.ts` and the page's own Supabase
session read.** `proxy.ts` already gates unauthenticated visitors before the
page renders (unchanged per AC #3), and the Server Component reads its own
session via `src/lib/supabase/server.ts` to fetch data. These should always
agree since they read the same cookies, but if they ever disagree, the
user-visible failure mode should be the same inline "couldn't load" message
described above, not a raw crash — worth an explicit test case, flagging for
architecture rather than deciding the mechanism myself.

## 7. Copy reference (verbatim, for engineering to grep against)

- `/trips` loading: `Loading your trips…`
- `/trips` empty: `You're not on any trips yet.` / button `Start a trip`
- `/trips` error: `Couldn't load your trips.`
- `/trip/[id]` loading: `Loading your trip…`
- `/trip/[id]` error (not a member / any failure): `Couldn't load this trip — you may not be on it.`
- `/trip/[id]` empty expenses: `No expenses logged yet.`
- `/trip/[id]` locked badge: `Locked`
- `/trip/[id]` locked bottom bar: `Trip is locked — no more expenses`
- `/trip/[id]` active bottom bar: `Add an expense`

## 8. Open items for PM/eng sign-off (flagged, not decided here)

1. Timezone handling for date formatting (section 6) — needs an explicit
   answer before merge, not a default.
2. Whether to split "not a member" vs. "genuine backend error" into inline
   message vs. `error.tsx`-with-retry, for both pages (sections 3 & 4) —
   recommending strict preservation now, split as a follow-up.
3. Confirm two small new files (`src/app/trips/loading.tsx`,
   `src/app/trip/[id]/loading.tsx`) reusing exact existing copy are
   acceptable as "not a visual change" even though they're new files — the
   alternative is relying on the generic global `Loading…`, which is a
   worse (if simpler) match to today's copy.
