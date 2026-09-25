# Design: Remove member from roster + self-service leave trip

Status: ready for architecture/engineering handoff. Grounded in
`docs/features/remove-member-access/requirements.md` (scope, acceptance criteria) and the
existing `/trip/[id]/invite` roster screen (`src/app/trip/[id]/invite/page.tsx`), which already
ships the closest precedent — organizer add/rename/remove for *placeholder* members, with an
inline confirm-card pattern this design extends to real members and to self-leave.

## 0. Design principles carried from requirements

- **Honest framing, not "revoke access."** Every piece of copy below says "remove from trip" /
  "leave trip," never "revoke access" or "block." The confirm step always discloses the rejoin
  caveat in plain language — not a tooltip, not a footnote.
- **Same weight as the placeholder-remove precedent**, structurally: inline confirm-in-card, no
  modal/overlay, cancel-by-default framing ("Keep them" is the safe button). See open question
  in section 7 on whether real-member removal should carry a bit more friction than
  placeholder-removal did.
- **No new visual language.** Reuses existing components (`Card`, `Button` variants `soft`/
  `ghost`/`primary`/`accent`, `Kicker`, existing icon set), existing locked-trip banner treatment,
  existing terracotta-for-destructive color token.

## 1. Entry points

Both actions live on the existing **Trip roster screen** (`/trip/[id]/invite`), reached via the
"Trip roster" icon (`PeopleIcon`) in the trip page's `TopBar` — already visible to **any**
verified member, organizer or not (`VerifiedActionIcons`, gated only on `verified`, not on
`isOrganizer`). This screen already renders every real member's card under "On the trip"
(`realMembers.map(...)`, `src/app/trip/[id]/invite/page.tsx:272`), so no new navigation is
introduced — just new affordances on existing rows.

- **Organizer view**: every other real member's card gets a small "Remove" icon button
  (mirrors the existing placeholder Rename/Remove icon pair — `CloseIcon`, `title="Remove"`).
  The organizer's own card never gets this — no icon at all, not even disabled (matches
  AC7's "not offered for the organizer's own row").
- **Non-organizer member view**: their *own* card gets a text-style "Leave trip" action instead
  of an icon (self-removal is a decision worth a labeled button, not a bare icon — see section 7).
  Other members' cards show no action for a non-organizer (they can't remove peers).
- Both affordances are hidden — not disabled — once the trip is locked (`view.trip.isCompleted`),
  consistent with how the placeholder controls already disappear under the existing locked
  banner (AC9, AC15).

No separate "Settings" surface is introduced. The roster screen already functions as the trip's
de facto membership-management surface; adding a second entry point (e.g. a menu on the trip
dashboard itself) would duplicate this for no benefit given requirements name no other trigger.

## 2. Flow — organizer removes a member

1. Organizer opens the roster screen, sees the full member list under "On the trip."
2. Taps the "Remove" icon on a member's card.
3. The tapped card flips in place to an inline confirm state (same interaction shape as the
   existing placeholder-remove confirm — `confirmRemoveId` — no modal, no page navigation, no
   layout jump elsewhere on the screen). Only one row can be in confirm state at a time; tapping
   another row's Remove (or Rename, if this pattern is reused for real members later) cancels the
   first.
4. Confirm card copy (exact strings):

   > **Remove [Display Name] from this trip?**
   > They'll lose access to this trip's expenses and roster. Everyone else's split will update to
   > cover the total without them. If they still have the invite link, they can rejoin the same
   > way they joined — removing them doesn't cancel the link.

   Buttons: **"Keep them"** (safe/default, `variant="soft"`) and **"Remove"**
   (`variant="ghost"`, terracotta text — matches the placeholder pattern's danger styling).

5. **Loading**: tapping "Remove" disables both buttons; the button label changes to
   **"Removing…"** (matches `removeSubmitting` pattern already used for placeholders).
6. **Success**: the card collapses back to the roster list, which now excludes the removed
   member — no separate toast; the list itself updating is the confirmation, consistent with how
   placeholder-remove already behaves (`refresh()` re-fetches `getTripView`).
7. **Error** (e.g. network failure, trip got locked concurrently, RLS rejection): inline text
   under the confirm copy, terracotta, matching the existing pattern:
   > **"Couldn't remove them — try again."**
   The confirm card stays open (not dismissed) so the organizer can retry without re-navigating.
   If the specific cause is "trip just got locked," prefer a more specific message where the
   client can detect it:
   > **"This trip was just locked — the roster can't be changed anymore."**
8. **Cancel**: "Keep them" (or tapping the Remove icon again) collapses the confirm card back to
   the normal row with no change.

Removing the **last other member** (leaving just the organizer) uses the identical flow — no
special-cased copy or extra warning, per requirements' "removing the last other member is
allowed."

## 3. Flow — member leaves the trip

1. Any non-organizer member opens the roster screen and finds their own card under "On the trip,"
   now showing a **"Leave trip"** text action (not an icon — see section 7 for why this one
   affordance is a labeled button rather than matching the icon-only Remove treatment).
2. Tapping it opens the same inline confirm-card pattern, on their own row:

   > **Leave [Trip Name]?**
   > You'll lose access to this trip's expenses and roster. Your past expenses stay in the trip
   > exactly as they are. If you change your mind, you can rejoin using the same invite link.

   Buttons: **"Stay"** (`variant="soft"`, safe/default) and **"Leave trip"**
   (`variant="ghost"`, terracotta).
3. **Loading**: button reads **"Leaving…"**, both buttons disabled.
4. **Success**: unlike organizer-removal (where the actor stays on the same screen), the actor
   here just lost their own access — the roster screen is no longer theirs to view. Redirect to
   `/trips` (their trip list), with a one-line confirmation banner at the top of that screen:
   > **"You left [Trip Name]."**
   (`/trips` is the existing "your trips" list — `src/app/trips/page.tsx` — the natural landing
   spot once a trip is no longer accessible; no new destination screen needed.)
5. **Error**: inline under the confirm copy, same terracotta pattern:
   > **"Couldn't leave the trip — try again."**
   (or the locked-trip variant, matching section 2 step 7).
6. **Cancel**: "Stay" collapses the confirm card, no change.

The organizer never sees "Leave trip" on their own card (AC14) — their card has no action at all
on this screen, same as section 1.

## 4. Locked-trip state (shared by both flows)

Both the Remove icon and the Leave-trip action are **hidden** (not shown-but-disabled) once
`view.trip.isCompleted` is true — matching how the existing placeholder controls already
disappear behind this screen's locked banner:

> **"This trip is locked — the organizer already settled it up, so the roster can't be
> changed."**

This existing banner (`src/app/trip/[id]/invite/page.tsx:412-423`) already covers the concept;
no new locked-state copy is needed beyond confirming both new affordances respect the same gate.
A member who somehow reaches the confirm step right as the trip locks (race) gets the inline
error variant from step 7/section-3-step-5 above rather than a silent failure.

## 5. The removed/left member's landing state

This is the "notification" per requirements — in-app only, shown the next time the removed/left
member loads `/trip/[id]` (bookmark, invite link, back button, anything). It must be visibly
different from both a generic error and the public `TripSummaryOnly` a stranger would see.

**Screen** (reuses `Screen`/`ScreenContent`, matches the visual weight of other single-message
trip states like the "Couldn't load this trip" fallback, but distinguishable by icon + copy):

```
┌─────────────────────────────┐
│  (small circular icon, e.g.  │
│   muted PeopleIcon / an      │
│   "exited" glyph — no red/   │
│   alarming color; this is    │
│   informational, not an      │
│   error)                     │
│                               │
│  You're no longer on this    │
│  trip.                       │
│                               │
│  [Removed copy variant:]     │
│  The organizer removed you   │
│  from "[Trip Name]." Your    │
│  past expenses are still     │
│  part of the trip's record.  │
│                               │
│  [Left copy variant:]        │
│  You left "[Trip Name]."     │
│  Your past expenses are      │
│  still part of the trip's    │
│  record.                     │
│                               │
│  [Rejoin with the link]      │
│  [Back to my trips]          │
└─────────────────────────────┘
```

Copy (exact strings):
- Removed: **"You're no longer on this trip."** / body: **"The organizer removed you from
  '[Trip Name].' Your past expenses are still part of the trip's record."**
- Left (only reachable if they somehow return without the client-side redirect from section 3,
  e.g. a stale tab): **"You left this trip."** / body: **"You left '[Trip Name].' Your past
  expenses are still part of the trip's record."**
- Primary action: **"Rejoin with the invite link"** — only shown if they still have/recall the
  invite link (this state does not itself display the invite code or link; that would hand a
  removed member a fresh way to re-enter — see section 7 flag on this).
- Secondary action: **"Back to my trips"** → `/trips`.

This state must **not** fall back to `TripSummaryOnly` (the public balances view) or to the
generic "Couldn't load this trip — you may not be on it" message — both of those are for
strangers/bad links, not for someone who has a history with this specific trip.

## 6. Copy reference (all strings in one place)

| Context | Copy |
|---|---|
| Organizer remove confirm title | "Remove [Name] from this trip?" |
| Organizer remove confirm body | "They'll lose access to this trip's expenses and roster. Everyone else's split will update to cover the total without them. If they still have the invite link, they can rejoin the same way they joined — removing them doesn't cancel the link." |
| Organizer remove — keep button | "Keep them" |
| Organizer remove — confirm button | "Remove" / loading: "Removing…" |
| Organizer remove — generic error | "Couldn't remove them — try again." |
| Organizer remove — locked error | "This trip was just locked — the roster can't be changed anymore." |
| Leave — entry point label | "Leave trip" |
| Leave confirm title | "Leave [Trip Name]?" |
| Leave confirm body | "You'll lose access to this trip's expenses and roster. Your past expenses stay in the trip exactly as they are. If you change your mind, you can rejoin using the same invite link." |
| Leave — stay button | "Stay" |
| Leave — confirm button | "Leave trip" / loading: "Leaving…" |
| Leave — generic error | "Couldn't leave the trip — try again." |
| Leave — success banner (on /trips) | "You left [Trip Name]." |
| Landing state — removed title | "You're no longer on this trip." |
| Landing state — removed body | "The organizer removed you from '[Trip Name].' Your past expenses are still part of the trip's record." |
| Landing state — left title | "You left this trip." |
| Landing state — left body | "You left '[Trip Name].' Your past expenses are still part of the trip's record." |
| Landing state — primary action | "Rejoin with the invite link" |
| Landing state — secondary action | "Back to my trips" |
| Locked-trip banner (existing, reused) | "This trip is locked — the organizer already settled it up, so the roster can't be changed." |

## 7. Mobile/responsive notes

This app is already mobile-first single-column (`Screen`/`ScreenContent` max-width, sticky
`BottomBar`, inline cards instead of modals). Both new flows deliberately avoid introducing a
modal/dialog overlay — the inline confirm-card pattern already works well on small screens
(no backdrop management, no extra tap targets near screen edges, keyboard-safe since there's no
text input in these confirms). Buttons are full-width-within-card at the existing `h-[38px]`
size used by the placeholder-remove confirm, comfortably tappable. The "Leave trip" redirect to
`/trips` after self-leave uses a full navigation (not a client-side toast layered over the now-
inaccessible trip screen), avoiding any flash of a screen the member can no longer legitimately
view.

## 8. Flagged for product/architecture — not resolved here

1. **How does the removed member's client actually distinguish "I was removed" from "I never
   was a member" at load time, given there's no audit trail (scope decision 8)?** For self-leave
   (section 3), the acting session already knows in the moment and can carry that state through
   its own redirect — no ambiguity. But for **organizer-removal**, the removed member's *next*
   page load is a fresh request with no signal from the removal event itself. Server-side RLS can
   only tell "not currently a member," which is indistinguishable from "never was a member" or
   "wrong link" without something that persists across the removal — e.g. a client-side flag set
   at join time (localStorage/cookie: "I have joined trip X"), which this design assumes exists
   so section 5's screen can trigger correctly. If that mechanism doesn't already exist or isn't
   feasible without new server state, this is a real gap between what requirements ask for
   ("explicit removed state, not a generic error") and what's buildable without an audit trail —
   worth an explicit architecture call before implementation, not something I can resolve as a
   UX decision.
2. **Icon-only vs. labeled affordance weight for organizer-removing-a-real-person.** I matched
   the existing placeholder-remove pattern (icon + inline confirm) for consistency, but removing
   a real, participating person is a heavier action than removing a name-only placeholder — the
   confirm-card catches accidental taps either way, so I judged this sufficient, but if the
   organizer/PM wants more friction (e.g. requiring the member's name typed, like some apps do
   for destructive account actions), that's a product call, not implied by requirements.
3. **Should the "removed/left" landing state expose the invite link/code directly**, rather than
   just a "Rejoin with the invite link" action that requires them to already have the link
   elsewhere? Showing it inline is more convenient but sits oddly next to "no invite-code
   rotation" being framed as an honest-disclosure-not-a-feature — handing the code back out
   proactively could read as encouraging the rejoin loophole rather than just disclosing it. I
   left it as "use the link you already have" (no code shown) as the more conservative default;
   flagging in case the user wants the friendlier version instead.
4. **Success feedback for organizer-removal is "the list updates," with no toast/banner** — mirrors
   the existing placeholder-remove precedent exactly. If the organizer removes someone while
   scrolled past that part of the roster, the change could be easy to miss. Low-risk given the
   list is short and on the same screen, but noting the tradeoff since self-leave *does* get an
   explicit banner (because the actor leaves the screen entirely) and organizer-removal doesn't
   (because they don't) — an intentional asymmetry, not an oversight.
