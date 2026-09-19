# Remember sign-in email

## Problem statement

Splitiful's sign-in flow (`src/app/page.tsx`) uses Supabase magic links: every
visit, the user must type their email from scratch to request a new sign-in
link. Magic links expire and aren't always used immediately (email delays,
switching devices, coming back days later), so returning users on the same
device end up retyping the same email repeatedly. This is a small-but-real
friction point on the single screen that stands between a user and the app.

The user need: on a device I've signed in from before, let me request a new
sign-in link without retyping my email — while still letting me easily use a
different email if this isn't my device or I'm inviting someone else.

## Scope clarification (read before building)

The request as phrased ("don't have to enter email to get sign-in link
again") is about **prefilling the email field**, not about extending login
sessions. These are very different in scope:

- **This feature (in scope): remember the email address** the user last used
  on this device/browser, and prefill the sign-in form with it. The user
  still requests a fresh magic link and still clicks through it — just
  without retyping the email. Pure client-side convenience (e.g.
  `localStorage`), no server/session changes.
- **Out of scope: staying logged in longer** (extending Supabase session/JWT
  refresh-token lifetime so the user skips the sign-in screen entirely on
  return). That's a separate, materially larger change (touches session
  config, security posture, "log out" semantics) and is **not** covered by
  this requirements doc. Flagging this explicitly so it isn't silently
  bundled in.

If what's actually wanted is the longer-session behavior, that should be
scoped as its own feature.

## Implementation sequencing note

The current email `Field` in `src/app/page.tsx` has no `name` or
`autoComplete` attribute (the shared `Field` component in
`src/components/ui.tsx` does pass through arbitrary input props, so this is
just an omission, not a limitation). Adding `name="email"` and
`autoComplete="email"` is a trivial, independent, near-zero-cost fix and
should ship as part of this same pass alongside the localStorage mechanism
below — not gated behind it, and not treated as a substitute for it.

Reasoning for building both rather than shipping autocomplete alone and
waiting to see if it's "enough": native autofill only reliably persists
values a user has actively saved via a browser/password-manager prompt,
commonly doesn't trigger for a lone email field with no paired password,
and is off by default in private/incognito sessions. It also has no
in-app "clear" control — clearing it means the user has to go into browser
settings, which most people won't do. Because both fixes are cheap and
non-conflicting, sequencing them as "try one, measure, maybe build the
other later" adds a validation step that costs more than just building
both now. Acceptance criteria 1-8 below are unchanged and still in scope
for this pass.

## Acceptance criteria

1. After a user successfully submits the sign-in form (i.e. `signInWithOtp`
   succeeds and they're routed to `/check-email`), their email is stored
   locally on that browser/device.
2. On a later visit to the sign-in screen (`/`) on the same browser/device,
   the email field is pre-filled with the last-used email instead of being
   blank.
3. The prefilled email is editable like normal — the user can clear it or
   type a different address, and doing so does not require any extra
   "unlock" step.
4. Submitting the sign-in form with a different (or cleared-then-retyped)
   email updates the stored value to the new email, so the next visit
   prefills the newest one.
5. There is a clear, low-friction way to remove the remembered email from
   the device (e.g. a small "not you? clear" affordance near the field, or
   equivalent) so a shared/public device doesn't keep surfacing someone
   else's email indefinitely.
6. No email is ever sent anywhere as a result of this feature except the
   existing magic-link email the user explicitly requests — storage is local
   only (e.g. `localStorage`), never transmitted to a new destination or
   logged server-side.
7. If local storage is unavailable or blocked (private browsing, storage
   disabled), the sign-in form still works exactly as it does today — blank
   field, manual entry, no errors surfaced to the user.
8. Signing out of the app (if/where that exists) does **not** need to clear
   the remembered email — remembering the email is independent from being
   logged in (see scope clarification above). This is a UX default, not a
   security control, since no authentication or session data is stored.
9. The sign-in email input has `name="email"` and `autoComplete="email"`
   set, so it participates in native browser autofill as a baseline (this
   is complementary to, not a replacement for, criteria 1-8).

## Non-goals

- Extending session/login duration so users skip sign-in entirely (see
  scope clarification above).
- Auto-submitting or auto-sending a sign-in link on page load without user
  action — the user must still explicitly click "Send me a sign-in link."
- Remembering/syncing the email across devices or browsers (this is local
  to one browser only, not account-linked).
- Any new settings/preferences UI beyond the inline "clear" affordance.
- Storing anything beyond the email address (no tokens, no invite codes, no
  trip context).
- A/B testing or measuring whether autocomplete alone would have been
  "enough" before building the localStorage mechanism — both are cheap and
  ship together (see Implementation sequencing note).

## Privacy/security notes

- The stored value is just an email address the user typed, in the same
  browser's local storage — comparable to normal browser autofill behavior,
  and strictly less sensitive than a session token. No new PII categories
  are introduced beyond what the user already voluntarily types into the
  form each time today.
- On a shared/public computer, a lingering prefilled email is a minor
  information-disclosure/annoyance risk (reveals who last tried to sign in)
  — addressed by acceptance criterion 5 (easy clear).

## Semver classification

**Feature** (backward-compatible, minor bump). It's a net-new, additive
convenience on an existing flow: nothing that previously worked stops
working, no API/contract changes, and users who don't want it can simply
type over the prefilled value exactly as before.
