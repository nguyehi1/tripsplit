# Design import: Splitiful Mobile

Source: https://claude.ai/design/p/2098174b-e7fa-417b-9c85-3b7febaac590?file=Splitiful+Mobile.dc.html
("Splitiful mobile app design" project, imported via the Claude Design MCP on 2026-09-18.)

## What this is

`Splitiful Mobile.dc.html` is a **design comparison canvas**, not a finished
single mockup. It has two turns:

- **Turn 1 — "Splitiful — the shipped flow, screen by screen"** (options 1a-1c):
  a few baseline screens recreated from the *current* shipped app (tokens/components/icons
  matched to `src/app/globals.css`, `src/components/ui.tsx`, `icons.tsx`), for reference only.
  Not something to (re)build — it already exists in the codebase.

- **Turn 2 — "Material, motion, and Miso — the same flow, having more fun"**
  (options 2a-2ah): the same ~17-screen flow, each screen rendered in **two**
  competing visual treatments —
  - `warm paper`: lit paper ground, soft ochre/terracotta glow, faint paw-print
    texture, blurred nav bar the content scrolls under, primary action as a
    floating blurred capsule, add-expense as a spring-up sheet over a dimmed trip.
  - `dark glass`: same structure, dark translucent-glass material instead of
    the lit paper ground.

  Structure/layout is identical between the two treatments — only the material
  (color, translucency, glow, texture) differs. A dog mascot, "Miso," appears
  throughout (welcome, empty states, add-expense, all-trips, etc.) as a
  candidate new brand element.

### Screens covered by turn 2 (each in both treatments)

Welcome · The trip (main view) · Add an expense (sheet) · Trip complete ·
All trips (with data) · Create a trip · Sign back in (6-digit code) ·
Trip before email confirmed (actions hidden not greyed) · Details
(per-person share breakdown) · Edit an expense (own rows only, while open) ·
Opening an invite link (no sign-in) · The roster (invite link + who's on) ·
Settle up mid-trip (organizer-only) · Feedback (in-app, once) ·
All trips, empty (first run) · Loading (skeleton) · Broken/dead-link error.

## Decisions made with the user

Feature is named **ux-revamp** (renamed from an earlier "splitiful-mobile"
working name — see below on why "mobile" was dropped).

- **Visual direction (2026-09-18, superseded 2026-09-18): warm paper ships
  now.** Originally left undecided pending planning/UX debate; the user then
  settled it directly: build the **warm paper** treatment now, as the app's
  (light) theme. **Dark glass is not dropped** — it's deferred and earmarked
  as the future **dark mode** counterpart to warm paper's light mode. Since
  structure/layout is identical between the two treatments (only the
  material/color/translucency differs, per above), architecture should use
  themeable tokens from the start even though only the light/warm-paper theme
  ships in this pass — that groundwork avoids redoing the token layer when
  dark mode is built later.
- **Miso mascot: confirmed.** To be adopted as a real, permanent brand element
  (not just explored in this mockup) — illustration asset pipeline and brand
  voice are follow-on considerations, not open questions.
- **Scope (2026-09-18, superseded 2026-09-18): NOT mobile-specific.** Originally
  scoped as "build the first mobile-optimized surface" (net-new, parallel to
  the existing desktop UI). The user then corrected this: **mobile is out of
  scope**. This is a **visual/UX restyle of the existing browser app** —
  applying the warm-paper look (blurred nav, floating action, glow ground,
  Miso, sheet-based add-expense, etc.) to the app's real pages. There is no
  separate mobile route tree, no mobile-only screens, and no dedicated mobile
  engineering effort: whatever responsive/mobile-browser behavior the app has
  today stays as-is. Turn 2's screens (drawn at phone width) serve as the
  visual/interaction reference for the new look, not as literal mobile-only
  deliverables — the restyle applies to the one browser app across whatever
  breakpoints it already supports.

## Excluded copy/behavior (user decision, 2026-09-18)

Two pieces of canvas copy are explicitly cut from the design going forward,
regardless of which slice eventually builds the screen they appear on:

- **The per-person live-math callout on Add an expense** ("Miso says
  that's $206.67 each," options 2e/2f) — the add-expense sheet should not
  narrate/restate the split amount through Miso.
- **The cross-trip running-total callout on All trips** ("Across all your
  trips, you're up $132.95," options 2i/2j) — when a later slice reaches
  the All trips screen (deferred, not in this pass), this line should not
  be built.

## Known gap: mascot art assets

`assets/miso-face2.png` and `assets/miso-wide.png` (referenced by the design)
could **not** be imported — the design MCP's `get_file` caps reads at 256 KiB
and both PNGs exceed that, so pulled bytes were truncated/corrupt and were
discarded rather than committed broken. Full-resolution art will need to be
re-exported through another path before engineering needs final mascot assets
(the design system CSS/tokens/HTML imported cleanly and are complete).

## Files here

- `Splitiful Mobile.dc.html` — the full canvas (complete, ~260KB).
- `support.js` — the `.dc.html` viewer runtime (not app code; renders the canvas format).
- `_ds/modernist-fe796f11-7213-4a2c-a941-89debcf9a6fa/styles.css` — design-system
  tokens/components backing the canvas (accent `#ec3013`, `Archivo` font, sharp
  corners — this is the *current* design system's look, distinct from the
  warm-paper/dark-glass treatments proposed for turn 2, which restyle on top of it).
- `_ds/modernist-fe796f11-7213-4a2c-a941-89debcf9a6fa/_ds_bundle.js` — empty
  component bundle (no reusable components were exported from this project).
