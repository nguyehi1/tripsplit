# Planning: UX Revamp

Status: Checkpoint 1 resolved by the user on 2026-09-18 (see "Checkpoint 1
outcome" below) — feature renamed from the working name "Splitiful Mobile" /
slug `splitiful-mobile` to **UX Revamp** / slug `ux-revamp`, and two of the
open questions below were decided directly rather than left to `pm`. The
debate history below (from before the rename/rescope) is kept as record of
the reasoning; where the user's decision supersedes it, that's called out
inline. Not a requirements doc — the `pm` agent formalizes requirements next.

## Checkpoint 1 outcome (user decision, 2026-09-18)

1. **Warm paper ships now, as the light theme.** Dark glass is deferred, not
   dropped — it's earmarked as the future **dark mode** counterpart. Build
   theme tokens from the start (even though only light/warm-paper ships now)
   so dark mode doesn't require redoing the token layer later. This resolves
   former open question 1 below.
2. **Mobile is out of scope.** This is a visual/UX restyle of the existing
   browser app (warm-paper look — blurred nav, floating action, glow ground,
   Miso, sheet-based add-expense — applied to the real app pages), not a
   mobile-specific build. No separate mobile route tree, no mobile-only
   screens, no dedicated mobile engineering; existing responsive/mobile-browser
   behavior stays as-is. This resolves former open question 3 below, and
   substantially changes the framing (not "net-new mobile surface") noted
   throughout the discussion section.

## Raw feature idea

Splitiful's UI needs a visual refresh, based on a design exploration imported
from Claude Design and saved at `docs/features/ux-revamp/design-import/`. The
imported canvas (`Splitiful Mobile.dc.html`, ~260KB, see
`design-import/README.md` — the filename is the design tool's own, from before
the rescope below) is a **comparison document, not a finished mockup**: it
recreates a few current shipped screens for reference (not to be rebuilt),
then proposes the same ~17-screen flow twice, drawn at phone width — once in
a "warm paper" material treatment (lit paper ground, ochre/terracotta glow,
floating capsule primary action, blurred nav, spring-up sheet for
add-expense) and once in "dark glass" (identical structure, dark
translucent-glass material instead). Per the Checkpoint 1 outcome above,
these screens are the visual/interaction reference for the new look, not
literal mobile-only deliverables — the restyle target is the existing browser
app. A dog mascot, "Miso," appears throughout as a proposed new brand
element. Full-resolution Miso art assets could not be imported (source PNGs
exceeded the design-import tool's 256KB read cap) — only the design system
CSS/tokens/HTML imported cleanly.

Screens covered by the canvas: Welcome, The trip (main view), Add an expense
(sheet), Trip complete, All trips (with data), Create a trip, Sign back in
(6-digit code), Trip before email confirmed, Details (per-person share),
Edit an expense, Opening an invite link, The roster, Settle up mid-trip,
Feedback (in-app once), All trips empty (first run), Loading (skeleton),
Broken/dead-link error.

## Decisions the user already made (not re-litigated here)

- **Scope is a restyle of the existing browser app, not a mobile build** —
  see Checkpoint 1 outcome above. (Supersedes this section's original
  "net-new mobile" framing, made before Checkpoint 1.)
- **Miso the mascot is confirmed** as a real, permanent brand element, not
  just a mockup exploration. Follow-on implications are flagged below as
  considerations, not treated as open.
- **Warm paper now, dark glass deferred as future dark mode** — see
  Checkpoint 1 outcome above.

## Orientation: relevant existing context

- `docs/ROADMAP.md` currently has one blocking, unresolved item: the
  invite-code RPC grants for `get_trip_by_invite_code` and `join_trip` are
  still `grant`ed to `anon`/`authenticated` at the Postgres level, so a
  script can call Supabase's own PostgREST RPC endpoint directly with the
  public anon key and get a normal, unthrottled response — completely
  bypassing this app's own rate limiter. Two remediation options are
  already written down (revoke grants + service-role server client, or an
  in-function throttle) but neither is done yet. The same audit also
  surfaced compliance gaps with no owner yet (no privacy policy/ToS, no
  account-deletion/export flow, no retention policy for abandoned
  anonymous accounts).
- ADR 0005 (SSR page conversion pattern) established the current pattern for
  `/trips` and `/trip/[id]`: async Server Components fetching data,
  `<Link>`-based navigation, minimal client-side JS confined to genuinely
  stateful leaves. Any mobile surface would sit on top of this pattern, not
  replace it.
- ADR 0006 (anonymous auth + linking) is the basis for today's
  simplified-onboarding: anonymous Supabase sessions back pre-verification
  trip ownership, with a hide-until-verified UI pattern for unverified
  organizers, and an explicitly **unverified** assumption about
  anonymous-to-permanent linking behavior against a live Supabase project.
  Any mobile "sign back in" / "trip before email confirmed" screen would
  inherit that same unverified assumption.
- Recently shipped features (placeholder members, expense dates,
  remember-signin-email, edit-own-expense) have been intentionally narrow —
  useful baseline for sizing a 17-screen, two-material-treatment mobile
  surface against typical scope in this codebase.

## The discussion

A `pm` agent and a `product-strategist` agent were each given the raw idea,
the design-import README, and the roadmap/ADR context above, and asked to
debate scope and strategic value independently before converging.

### PM's initial take

- **Scope shape**: ruled out a native wrapper (different stack/distribution,
  not implied by the canvas) and a full installable/offline PWA
  (installability/offline was never asked for). Recommended a
  mobile-optimized layout/route variant of the existing Next.js app, sitting
  on top of the same Supabase/RLS/auth and the ADR 0005 SSR pattern — most
  of the canvas's treatment differences (blurred nav, floating capsule
  action, glow) are CSS/motion-layer, not new data or routing models.
  Flagged one exception: today's add-expense is a full page/route
  (`src/app/trip/[id]/add-expense/page.tsx`); the design wants it as an
  overlay sheet on the trip page — a real interaction-model/architecture
  question, not a CSS delta.
- **First slice**: recommended against attempting all 17 screens at once.
  Ranked list: Welcome, Create a trip, The trip (main view, highest-traffic
  by far), Add an expense (biggest structural delta), with Details and
  Settle-up as close seconds despite lower frequency ("moments that
  matter"). Everything else (sign-back-in, pre-confirmation state,
  edit-expense, invite-link opening, roster, feedback, all-trips
  states) deferred — loading-skeleton and error states called out as
  systemic patterns worth building once, not per-screen.
- **Warm paper vs. dark glass**: weak personal lean toward warm paper
  (emotional register fits a shared-trip-expense app better than
  dark-glass's "pro tool" register) but explicitly caveated as a weak read
  from the README's text description only, not the rendered canvas.
  Recommended the user look at the actual canvas and decide, or have
  ux-designer revisit once prototypes exist — kept as a named open decision,
  not quietly picked.
- **Sequencing**: flagged plainly that shipping a more inviting mobile front
  door (plausibly increasing trip-creation volume) while the invite-code RPC
  access-control issue and anonymous-account retention are still open
  "increases the surface area of exactly the two unresolved risks already
  on record" — but treated this as a flag for the user/architect, not a
  block it would impose itself.

### Product-strategist's initial take

- **User impact**: plausible category gap (on-the-go use case) but zero
  actual usage data behind it — no mobile session %, no complaint/bounce
  signal on record. Noted the already-"planned" `vercel-analytics` feature
  hasn't shipped and would be the cheap way to convert "is mobile worth a
  big bet" from a guess into evidence before committing to 17 screens.
- **Opportunity cost** (called the sharpest problem): the live/verified RPC
  exploit, the undecided compliance gaps, and the unverified ADR 0006
  linking assumption are all open at once; spending discovery/engineering
  cycles on a 17-screen parallel flow in two full material treatments plus a
  new mascot/illustration pipeline, on top of that, is a real opportunity
  cost given this codebase's recent shipped scope has been intentionally
  narrow.
- **Risk**: parallel-surface maintenance cost (net-new mobile means a second
  UI to maintain indefinitely — a precedent worth being deliberate about);
  called building and maintaining *both* material treatments in production
  "design gold-plating" relative to what's actually being decided (an
  aesthetic choice), risking "ship both, A/B test forever"; flagged the
  unfinished mascot asset pipeline (truncated PNGs) as creating a
  desktop/mobile brand-inconsistency risk with no rollout plan yet.
- **Simpler alternatives**: a responsive CSS pass on existing shared pages
  gets most of the "unusable on phone" pain far more cheaply than a parallel
  surface; if mobile-specific interaction patterns are genuinely warranted,
  layer them onto the existing single surface incrementally; if a parallel
  surface is wanted, pilot only the 2-3 highest-traffic screens; build
  shared structure once (identical between the two material treatments) and
  treat material as a cheap, later, token-level decision.
- **Warm paper vs. dark glass**: recommended building structure once and
  picking one direction to ship first via a cheap static-mockup/
  accessibility check, rather than shipping and indefinitely maintaining two
  live production treatments.
- **Initial overall recommendation**: "ship smaller / resequence" — resolve
  or schedule the blocking security item and compliance gaps before further
  spend on a large speculative UI bet, or, if the user wants forward motion
  now anyway, do a right-sized version (one material treatment, shared
  structure, 2-3 pilot screens, mascot art as its own sequenced task).

### The debate (round 2)

Each agent's initial take was relayed to the other. Both moved off their
opening positions:

- **Security/compliance sequencing**: product-strategist narrowed its
  position substantially. It agreed the broader compliance backlog (privacy
  policy, ToS, account deletion/export, retention policy) is fine running
  in parallel with mobile discovery/design — those are legal calls, not
  engineering blockers. But it held firm on one narrower point PM's own
  argument implied: shipping a more inviting front door (welcome,
  create-a-trip) while the invite-code RPC grants are still public
  literally grows the exploited surface (more trips, more invite codes
  circulating) rather than being generic opportunity cost. Its refined ask:
  the already-scoped, narrow RPC-grant fix should land before the
  welcome/create-trip screens actually ship — not before mobile discovery
  or architecture work starts.
- **First-slice scope**: both agents converged on a broader first slice than
  either proposed alone — **welcome + create-trip + trip view + add
  expense** — on the reasoning that mobile-optimizing the middle of a flow
  (trip view, add-expense) while leaving the front door (welcome,
  create-trip) desktop-shaped would be a jarring, inconsistent journey; the
  funnel has to be mobile-optimized as a unit. Both agreed to defer Details
  and Settle-up to a later slice — money-movement and detail-breakdown UI
  carry higher stakes than a first pass warrants, and both are lower
  frequency than the core create → view → add-expense loop.
- **Add-expense page vs. sheet**: PM's structural point held up under
  scrutiny — product-strategist conceded the page-to-overlay conversion
  (routing/history/back-button behavior, deep-linkability, state on
  close/reopen) is real architecture work, not a material/CSS decision, and
  said this makes add-expense the most expensive item in the first slice —
  reinforcing that it should be de-risked explicitly at the architect stage,
  independent of which material treatment wins.
- **Material treatment**: converged on building shared structure once
  (identical between warm paper and dark glass per the design-import
  README) and picking one direction via a cheap comparison rather than
  building and maintaining both in production indefinitely.
- **Route architecture**: product-strategist's "responsive CSS pass"
  alternative assumed a single route tree adapting at breakpoints (not a
  separate mobile-specific route tree served by viewport/user-agent
  sniffing), and argued explicitly against UA-based route splitting as
  brittle and a bigger maintenance/testing burden than solving the
  page-vs-sheet question with conditional rendering inside one route.
  **This is a stated preference/assumption from one agent, not a confirmed
  joint position** — PM's own original take listed "mobile-specific route
  vs. one responsive app" as an open question for the user, and the second
  round did not revisit or resolve it explicitly. It remains open.

## Points of agreement

- Net-new build sits on top of the existing Next.js/Supabase/RLS stack and
  the ADR 0005 SSR pattern — not a native wrapper, not a full
  installable/offline PWA.
- First slice = welcome, create-trip, trip view, add-expense as a coherent
  unit; Details and Settle-up deferred to a later slice.
- Add-expense's page-to-sheet conversion is real architecture work, not a
  cosmetic/CSS change, and should be scoped explicitly at the architect
  stage.
- Build the shared structure (nav, capsule action, sheet mechanics) once;
  don't build and maintain both material treatments in production —
  converge on one via a cheap comparison exercise, not by shipping both
  indefinitely.
- Broader compliance backlog (privacy policy/ToS, deletion/export,
  retention policy) can run in parallel with mobile work; it does not need
  to gate this feature's discovery or design stages.
- Miso's debut depends on an asset pipeline that isn't finished yet (source
  PNGs exceeded the design-import size cap) — flagged as a follow-on
  consideration, not a blocker for this pass. (The original "desktop/mobile
  brand-inconsistency" framing here is moot post-Checkpoint-1: there's one
  browser app, so Miso either appears there or doesn't — no split surface.)

## Remaining disagreement / unresolved (as debated, before Checkpoint 1 rescope)

- Whether the specific, already-scoped invite-code RPC-grant fix must ship
  before the welcome/create-trip screens go live (product-strategist's
  refined position), or whether shipping those screens in parallel with the
  fix merely tracked/flagged is acceptable (closer to PM's original
  framing). Both agents explicitly left this for the user rather than
  resolving it themselves. **Carried forward as open question 1 above, but
  the reasoning behind it has weakened now that scope is a restyle of
  already-live screens rather than a new mobile funnel** — re-ask rather
  than assume the original framing still applies at full strength.
- ~~Whether the mobile surface is one responsive route tree with
  breakpoint-conditional rendering, or a separate mobile-specific route
  tree~~ — **moot; resolved by the Checkpoint 1 scope decision** (no
  mobile-specific build at all).

## Recommended direction (as amended by Checkpoint 1)

1. Restyle the existing Next.js/Supabase browser app to the warm-paper
   material treatment — not a mobile-specific build, not a native wrapper,
   not a PWA. Reuse the ADR 0005 SSR pattern for data-fetching; this is a
   presentation-layer change to the app that already exists.
2. First slice: **Welcome, Create a trip, The trip (main view), Add an
   expense** as one coherent unit. Defer Details, Settle-up, and the
   remaining ~11 canvas screens (sign-back-in, pre-confirmation state,
   edit-expense, invite-link opening, roster, feedback, all-trips states,
   loading/error patterns) to later slices — loading and error treatment
   should be designed once as a systemic pattern when it's tackled, not
   per-screen. (This slice was originally reasoned as a mobile funnel; it
   still holds as a sensible first slice by traffic/structural weight now
   that the goal is a general restyle — `pm` should re-confirm it holds
   under the new framing rather than assume it silently carries over.)
3. Treat add-expense's page-to-overlay-sheet change as a real architecture
   decision to scope explicitly (routing/history/back-button/deep-link
   behavior) — this is a UI-pattern change independent of viewport, not a
   mobile-only concern, and independent of the theme-token decision.
4. Build the visual system with themeable tokens (light = warm paper, ships
   now; dark = dark glass, deferred) rather than one-off hardcoded values,
   so dark mode is a token-swap later, not a rebuild.
5. Track Miso's illustration asset pipeline (final-resolution art,
   re-exported through a path that isn't capped at 256KB) as a dependency
   this feature needs before engineering can ship final visuals.

## Resolved at Checkpoint 1 (previously open)

- ~~Visual direction — warm paper vs. dark glass vs. keep exploring both~~ →
  **warm paper now, dark glass deferred as future dark mode.** See Checkpoint
  1 outcome above.
- ~~One responsive route tree vs. a separate mobile-specific route tree~~ →
  **moot: there is no mobile-specific build.** This is a restyle of the
  single existing browser app. See Checkpoint 1 outcome above.

## Open questions for the user (remaining)

1. **Does the invite-code RPC-grant fix still need to sequence relative to
   this work, now that scope is a restyle rather than a new mobile funnel?**
   Product-strategist's original concern was that shipping a *more inviting
   new* welcome/create-trip surface would grow the exposed surface of the
   live, verified exploit (more trips, more invite codes) — that reasoning
   assumed net-new mobile traffic. Under the restyle framing, welcome/
   create-trip already exist and are already live; a visual-only change to
   already-shipped screens doesn't clearly grow that surface the same way.
   Worth an explicit call anyway: (a) treat the RPC fix as fully unrelated
   and independently scheduled, or (b) still land it first out of caution
   before touching those two screens. The fix itself (revoke `anon`/
   `authenticated` execute grants + service-role client, or an in-function
   throttle) is already scoped in `docs/ROADMAP.md`.

2. **How urgent is this restyle relative to everything else open on the
   roadmap** (the RPC-grant fix, the compliance backlog, the unverified ADR
   0006 linking assumption)? Neither agent claimed authority to prioritize
   this — that's the user's call.

3. **Is placeholder/lower-resolution Miso art acceptable for the first
   slice**, or does final art need to be re-exported and finalized before
   engineering starts on the mascot-bearing screens (welcome, empty
   states)?

4. **Target browser support matrix** — standard desktop + mobile-web browser
   support as the app has today, or anything narrower/broader to design and
   QA against?
