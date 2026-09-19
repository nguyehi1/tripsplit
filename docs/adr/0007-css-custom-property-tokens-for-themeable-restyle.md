# 0007. CSS custom properties as the token layer for themeable (light-now, dark-later) styling

Status: accepted
Date: 2026-09-18

## Context

The ux-revamp feature (`docs/features/ux-revamp/requirements.md`, AC1/AC2)
requires color, spacing, radius, shadow/glow, and typography values used by
the four restyled screens to be named, themeable tokens — not hardcoded
per-component values — so that a future "dark glass" theme is a token-value
swap, not a rebuild. Exactly one theme ("warm paper") ships now; no toggle,
no `prefers-color-scheme` handling, no dark values populated yet.

Orienting in the codebase surfaced something the requirements' problem
statement didn't anticipate: `src/app/globals.css` and `src/components/ui.tsx`
already define and use a warm-paper-*adjacent* palette (`--color-paper`,
`--color-ink`, `--color-accent` (ochre oklch), `--color-terracotta`, a
`text-display` typographic role on `Bricolage_Grotesque`/`Instrument_Sans`
fonts, rounded-full "capsule" buttons, and a `Screen` component with an
opt-in ambient-glow prop already used on `/` and `/trips`) — this is
materially different from the "modernist" system (`#ec3013` accent, sharp
corners, `Archivo` font) the design-import's own README says it matched
against and that requirements.md's problem statement describes as today's
look. See `docs/features/ux-revamp/architecture.md`'s "Orientation finding"
section for the full comparison; this ADR proceeds on the basis that the
real gap to close is narrower than "build a theme from scratch" but the
*mechanism* question (how tokens are expressed so a later dark theme is a
value swap) is unchanged and still needs a real decision, because today's
token coverage is incomplete: many colors, shadows, and radii the four
screens actually use are hardcoded literals (raw `oklch(...)`/`rgba(...)`
strings in `style` props, Tailwind arbitrary-value brackets like
`rounded-[22px]`) duplicated across files rather than named custom
properties — including cases where the *exact same* literal
(`oklch(0.95 0.035 44)`) is both a named token (`--color-terracotta-soft`)
and, separately, copy-pasted as a raw string in `trip/new/page.tsx` and
`add-expense/page.tsx` instead of referencing the token. A literal in a
`style` prop can't be swapped by a dark theme; only a `var(--token)`
reference can.

## Decision

**Keep CSS custom properties, defined in `src/app/globals.css`'s `:root`
block, as the single token mechanism — extend the existing set to full
coverage, don't introduce a second mechanism.**

1. **All color, shadow, and radius values the four restyled screens use
   become named custom properties in `:root`**, extending today's partial
   set (`--color-paper`, `--color-ink`, `--color-card`, `--color-accent(-strong/-soft)`,
   `--color-terracotta(-soft)`) with the ones the screens actually need and
   today hardcode inline: an accent "glow" chip background and its paired
   text/deep tone (today's repeated `oklch(0.95 0.04 88)` /
   `oklch(0.38 0.08 80)` literals), the three ambient glow-blob colors
   `Screen`'s `glow` prop paints (`oklch(0.86 0.12 84)`,
   `oklch(0.8 0.13 36)`, `oklch(0.92 0.07 95)`), the positive/negative
   balance colors `trip-tabs.tsx` uses for `ProgressBar` (`oklch(0.68 0.12 85)`,
   `oklch(0.7 0.1 44)`), the neutral avatar placeholder color, and the two
   shadow values `Card`/`IconButton` hardcode as Tailwind arbitrary values
   (`--shadow-card`, `--shadow-card-sm`) plus a small radius scale
   (`--radius-card`, `--radius-field`, `--radius-chip`, `--radius-tile`) for
   the handful of radii actually reused across ≥2 of the four screens.
   Values that are genuinely one-off (a single arbitrary pixel size used
   exactly once) are not force-fit into a token — AC1 asks for named,
   reusable values to stop being hardcoded per-component duplicates, not for
   every literal in the file to be renamed.
2. **Continue mirroring color/font tokens (and now shadow/radius) through the
   existing `@theme inline` block** so Tailwind utility classes
   (`bg-paper`, `text-terracotta`, and new ones like `shadow-card`,
   `rounded-card`) stay available at call sites, exactly the pattern already
   established for `--color-*`/`--font-*`. This keeps one authoring surface
   (`globals.css`) instead of a token file plus a separate Tailwind config.
3. **No `[data-theme]`/`.dark` selector, toggle, or `prefers-color-scheme`
   query is added in this pass** (AC2 — exactly one resolved theme, no
   switching mechanism expected yet). The document only needs to make dark
   mode *cheap later*: as long as every consumer references `var(--color-*)`
   / a token-backed utility class and never a raw literal, a future dark-mode
   feature can wrap `:root`'s block as `:root, [data-theme="light"] { ... }`
   and add a sibling `[data-theme="dark"] { ... }` with dark-glass values,
   touching zero `.tsx` files. That capability is the acceptance bar for
   "themeable," not the switching UI itself.
4. **New, not-yet-tokenized concerns this restyle introduces (blurred nav
   surface, floating-capsule elevation, paw-print texture, sheet motion
   timing) get named tokens from the start**, not one-off values, since
   they're introduced by this feature rather than inherited: e.g.
   `--surface-nav` (translucent surface color) + a `backdrop-blur` utility
   for the sticky nav, `--shadow-capsule` for the floating primary action,
   `--texture-paw` (a background-image custom property pointing at a small
   SVG asset) as an opt-in modifier similar to `Screen`'s existing `glow`
   prop, and `--ease-spring`/`--duration-sheet` for the add-expense sheet's
   entrance motion.

## Alternatives considered

- **Tailwind's `dark:` variant classes (or `next-themes`) instead of custom
  properties.** Rejected: a large share of this codebase's color usage is
  already inline `style={{ background: ... }}` (needed because many values
  are computed per-row, e.g. avatar colors, or because Tailwind's generated
  utility set doesn't cover an arbitrary `oklch(...)`), and a `dark:`
  utility class can't touch a `style` prop at all — every one of those call
  sites would need converting to a class-based approach just to become
  themeable, a much larger diff than extending the token set already in use.
  Custom properties work identically whether a value is consumed via a
  utility class or a `style={{ color: "var(--x)" }}` prop, so they cover both
  patterns this codebase actually uses without picking a winner between them.
- **A separate design-token JSON file / Style Dictionary-style pipeline.**
  Rejected as disproportionate: four screens and a bounded set of tokens
  don't need a build step or a second source of truth; `globals.css`'s
  `:root` (already the sole place tokens are declared) stays sufficient, and
  matches this repo's general bias toward the smallest mechanism that solves
  the stated problem (see ADR 0005's own restraint about not eliminating a
  second `getUser()` round trip without a demonstrated need).
- **CSS-in-JS (e.g. a runtime theme object passed via context).** Rejected:
  introduces a new library and a runtime cost for a static, build-time-known
  value set; also cuts against ADR 0005's Server-Component-first,
  minimal-client-JS posture — a theme context provider would need to be a
  client component wrapping the whole app.

## Consequences

- `globals.css` remains the one place token values live; any new
  color/shadow/radius a future screen needs should extend `:root` (and
  `@theme inline` if it needs a utility class), not introduce a local literal
  — this is now the explicit convention for `docs/ARCHITECTURE.md`'s "Known
  integration points" to point future features at.
- Component code (`ui.tsx` and any page needing a one-off color) must reference
  `var(--token-name)` or a token-backed utility class, never a raw
  hex/oklch/rgba literal, for anything that should participate in a future
  theme swap. This is a review-time discipline, not something the type
  system enforces — flagged for the engineer/QA stage to check by grep
  (`oklch(`/`rgba(`/`#[0-9a-f]{3,6}` literals inside `src/app` and
  `src/components/ui.tsx` outside of `globals.css` itself) rather than
  relying on it being caught by accident.
- Dark mode, when built, is scoped to: adding the `[data-theme="dark"]`
  block of values, a small mechanism to set the `data-theme` attribute (a
  toggle, `prefers-color-scheme` read, or both), and nothing else in
  component code — assuming this ADR's discipline (no stray literals) was
  actually followed by every screen touched between now and then, including
  ones outside this feature's four-screen scope that might pick up new
  hardcoded values later. A future audit before shipping dark mode should
  re-grep for literals, not assume this ADR's rule was never violated.
