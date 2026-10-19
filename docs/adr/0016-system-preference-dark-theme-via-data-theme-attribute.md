# 0016. System-preference-driven dark theme via a `data-theme` attribute, set by a pre-paint inline script

Status: withdrawn (never merged/implemented) — dark mode descoped from `redesign-ui` before this
ADR shipped
Date: 2026-10-16

## Why this is marked withdrawn rather than accepted

This ADR was drafted while `redesign-ui`'s requirements still included shipping dark mode. Mid-way
through architecture, the PM/user descoped dark mode from this feature entirely (see
`docs/features/redesign-ui/requirements.md` decision #6, "Dark mode... out of scope for
`redesign-ui`, deferred to its own future feature") — `redesign-ui` ships **light theme only**.
No `[data-theme]` attribute, no dark value block, and no activation mechanism are built in this
pass, so there is no decision to record yet. The reasoning below is kept, not deleted, because the
*next* feature that actually ships dark mode will face the exact same question ADR 0007 originally
deferred (toggle vs. `prefers-color-scheme` vs. both) — this draft is a head start for that future
ADR, not a decision in force today. That future feature should write its own numbered ADR (treating
this content as a starting point, re-verified against whatever's shipped by then) rather than
un-withdrawing this one, per the ADR rule that a record is immutable once merged — this one was
never merged in the first place, so withdrawing rather than deleting is just to leave a visible
trail of why 0016 exists as a filename with no accepted decision behind it.

## Context (as drafted, for the future feature's reference)

ADR 0007 put every color/shadow/radius value this app uses behind a named CSS custom property in
`src/app/globals.css`'s `:root` block specifically so that "dark mode, when built, is scoped to:
adding the `[data-theme="dark"]` block of values, a small mechanism to set the `data-theme`
attribute (a toggle, `prefers-color-scheme` read, or both), and nothing else in component code" —
but deliberately left *which* of those mechanisms to use undecided, since no dark theme existed
yet to need one. `redesign-ui` was originally going to be the first feature to ship dark mode; it
no longer is. `docs/features/redesign-ui/architecture.md` §1 instead documents how this feature
keeps every new token as a named semantic variable (light values only) so that whichever future
feature does ship dark mode can add a `[data-theme="dark"]` block with no component rewrite — the
groundwork ADR 0007 asked for stays intact even though the switching mechanism isn't decided here.

## Decision (drafted, not in force)

Read `prefers-color-scheme` once, client-side, via a small synchronous inline script in
`src/app/layout.tsx`'s `<head>`, and set `data-theme="dark"`/`"light"` on `<html>` before first
paint. No stored preference, no in-app toggle. See the "Alternatives considered" section below for
the reasoning, which still applies whenever this is picked back up.

## Alternatives considered (drafted, not in force)

- A stored, user-facing toggle (new column or `localStorage`, a switch on `/you`) — heavier than
  needed unless a future feature's requirements actually specify toggle UI.
- `next-themes` or an equivalent library — disproportionate for a one-time, non-persisted read.
- Tailwind's `dark:` variant classes / a pure CSS `@media (prefers-color-scheme: dark)` block with
  no JS and no attribute at all — doesn't reach this codebase's many inline `style={{ background:
  "var(--token)" }}` call sites the way an attribute-driven custom-property override does, and
  forecloses an easy later upgrade to a manual toggle.

## Consequences

None — this ADR is not in effect. Nothing in `redesign-ui`'s shipped code depends on it.
