# Remember sign-in email — design

Companion to `requirements.md`. This is a small, single-screen feature; no
visual mockup was produced — the ASCII sketch below plus copy is sufficient
to build from. The interaction design worth care is the AC5 "clear"
affordance, since everything else is "prefill a text input."

## Where this lives

Everything happens on the existing sign-in screen (`src/app/page.tsx`,
route `/`). No new screens, no new routes. `/check-email` and
`/link-expired` are unaffected except that the "Use a different email" /
"Enter your email again" buttons on those screens route back to `/`, which
will now come back prefilled again (that's correct — see "Round-trip"
below).

## Happy-path flow

1. **First-ever visit.** Field is blank, placeholder `you@email.com`,
   exactly as today. User types their email, taps **"Send me a sign-in
   link"**. On success, the email is written to local storage and the user
   is routed to `/check-email` as today.
2. **Later visit, same browser.** User lands on `/`. The email field is
   already filled with their last-used address. No spinner, no "loading
   your info" moment — this is synchronous local storage, it should just
   already be there when the field paints (see "Avoiding a flash" below).
3. User taps **"Send me a sign-in link"** directly, no retyping. Same
   success path as today.
4. **Different email this time.** User selects-all/edits/retypes in the
   same field (it's a normal input, no unlock step — AC3). Whatever they
   successfully submit becomes the new remembered value, overwriting the
   old one (AC4).

## The AC5 "clear" affordance

This is the one real design decision in this feature: how does someone on
a shared/public device (library computer, partner's laptop, a phone passed
around a friend group) get rid of a prefilled email that isn't theirs,
with minimal friction?

**Placement:** a small text link, right-aligned in the same row as the
"Your email" field label — the label row already has spare horizontal
space and this keeps the affordance physically anchored to the thing it
acts on, so it reads as "this control affects this field" without needing
an icon or explanation.

```
 Your email                                    Not you? Clear
┌──────────────────────────────────────────────────────────┐
│ pat@example.com                                            │
└──────────────────────────────────────────────────────────┘
```

**Copy:** `Not you? Clear` — "Not you?" names the scenario in plain
language (shared-device empathy) rather than a generic "Clear field",
and "Clear" is the actual tappable verb. If a single short string is
preferred instead, `Clear saved email` is the fallback, but "Not you?
Clear" better matches this app's warm, conversational copy tone (see
"That link's done its job.", "Trips are fun. The math isn't.").

**Visibility rule:** only rendered when there is a remembered email to
clear (i.e., local storage has a value). On a first-ever visit with a
blank field, there's nothing to clear, so nothing is shown — no dead
affordance sitting next to an empty input.

**Behavior on tap — no confirmation dialog.** Tapping it immediately:
- empties the input field,
- removes the value from local storage,
- moves focus into the now-empty field so the person can start typing
  right away,
- the "Not you? Clear" link itself disappears (nothing left to clear).

No "Are you sure?" modal. Reasoning: the action is reversible in the only
sense that matters here — retyping an email is exactly the status quo
today, and the value being cleared is not a credential, session, or
anything destructive (per the requirements' own privacy framing, this is
strictly less sensitive than a saved session). A confirmation step would
reintroduce the friction this whole feature exists to remove, just
relocated to the exit path. This matches the app's existing pattern of
not gating low-stakes actions behind confirmation (e.g. "Use a different
email" on `/check-email` is a single tap, no dialog).

> **Flagging for product/you:** I chose no-confirmation because the
> action is low-stakes and reversible-in-spirit. If there's a reason to
> want a confirm step anyway (e.g. concern about accidental taps on a
> crowded mobile layout), that's a one-line change — worth a quick call
> rather than me guessing wrong in either direction.

**Should the link stay visible after the user starts typing over the
prefilled value?** Design choice: hide it as soon as the field content no
longer matches the remembered value (i.e., the user has started editing).
At that point they've already solved their own problem by typing over it;
a "Not you? Clear" link next to an email they just typed themselves would
be confusing ("clear what, this address I'm literally typing right now?").
If they clear the field back to empty or back to the exact remembered
value, the link can reappear.

> **Flagging for product/you:** this hide-on-edit behavior is a judgment
> call, not dictated by the acceptance criteria. The simpler alternative
> is "always show it whenever local storage has a value, regardless of
> what's currently typed" — less state to track, but a slightly odd
> visual once the user is mid-edit. I'd default to hide-on-edit for
> polish, but it's not load-bearing either way and is worth flagging
> since it's a real (if small) behavioral choice.

## States

**Empty (no remembered email).** Field blank, placeholder `you@email.com`,
no "Not you? Clear" link. Identical to today's screen — a first-time or
storage-cleared visitor should see nothing different.

**Prefilled (remembered email present).** Field populated with the stored
address, cursor not auto-focused into it (don't force the keyboard open on
load just because there's a value — only auto-focus after an explicit
clear, so the flow stays "read the screen, then act," consistent with how
`/` doesn't currently autofocus the email field on load either).

**Storage blocked/unavailable (AC7)** — private browsing, storage
disabled, quota errors, etc. Behaves exactly like "Empty" above: blank
field, normal manual entry, and critically **no error message, badge, or
indicator of any kind**. The user should not be able to tell the
difference between "you've never signed in on this device" and "your
browser is blocking this feature" — surfacing that distinction would be
confusing noise for zero actionable benefit (there's nothing the user can
do about it from this screen, and it's not a security-relevant condition
worth alarming them over).

**Post-submit (existing flow, unchanged).** Success still routes to
`/check-email?email=...` with the same copy as today ("We sent a sign-in
link to **{email}**..."). No new copy needed here — the write to local
storage happens silently alongside the existing `signInWithOtp` success
path, with no user-visible acknowledgment (a toast like "Email saved for
next time" would overstate a background convenience into something that
looks like a discrete action the user needs to notice).

**Round-trip via `/check-email` → "Use a different email" and
`/link-expired` → "Enter your email again".** Both buttons route back to
`/`, which will re-prefill from whatever is currently in local storage
(i.e., still the email they just used, since nothing failed). That's
correct, not a bug: "use a different email" means "let me change it here,"
not "wipe what you remembered" — those are different actions, and AC5's
clear affordance already exists for the latter. Worth stating explicitly
so it isn't "fixed" into forgetting the email on every failed attempt.

## Copy summary

| Element | Copy |
|---|---|
| Field label (unchanged) | `Your email` |
| Placeholder (unchanged, shown only when field is empty) | `you@email.com` |
| Clear affordance | `Not you? Clear` |
| Everything else on `/` | unchanged |

No new error strings are introduced by this feature. `friendlyAuthError`
and the existing "Enter your email first." validation message are
untouched — clearing the field just means the existing empty-field
validation applies as it already does today.

## Avoiding a flash of blank-then-filled

Because the sign-in page is a client component reading from
`localStorage` (which doesn't exist during server render), there's a risk
of a visible flicker: field renders blank on first paint, then
"pops" to the remembered value a beat later once client JS runs. On a
fast device this is imperceptible; on a slow one it reads as janky, and
it's exactly the kind of thing that's easy to skip and then shows up as a
"why did my email flash for a second" bug report. Worth having the
engineer read the storage value as early as possible in the component's
initial render path (not in a `useEffect` that runs after first paint) so
the field appears "already filled" rather than "fills itself in" — this
is an implementation detail I'm flagging for the architect/engineer
rather than specifying myself, but the UX requirement is: **no visible
flash, no layout shift.**

## Mobile considerations

This app's shell is already mobile-first (`max-w-md`, this is the screen
people hit right after tapping a shared trip link on their phone), so:

- The "Not you? Clear" link needs a comfortably tappable hit area even
  though it renders as small text — pad its tap target rather than
  relying on the visible text bounds, so it's reliably tappable next to a
  field people are about to tap into anyway (avoid accidental fat-finger
  taps on the field itself triggering it, and vice versa).
- Since it disappears after being tapped (nothing left to clear) and
  reappears only if a matching value is later re-stored, there's no risk
  of a lingering mis-tap loop.
- No hover-only affordance anywhere in this design (no tooltip-on-hover
  reveal for the clear link) — this needs to work identically on
  touch-only devices, which is the primary use case for this app.

## Open questions for product (recap)

1. **No-confirmation clear** — recommended, but flagging since it's a
   one-way (if low-stakes) action.
2. **Hide-on-edit for the "Not you? Clear" link** — recommended for
   polish, but "always show if storage has a value" is a valid simpler
   alternative if less state-tracking is preferred.

Everything else in this feature (prefill, overwrite-on-submit, silent
storage-blocked fallback, no change to logout behavior) follows directly
and unambiguously from the acceptance criteria and doesn't need a product
call.
