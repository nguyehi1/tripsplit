# Brand lockup — board S, Idea C ("wordmark as brand row, dog in the original sticker card")

**Status: supersedes board T's brand treatment.** User decision, 2026-10-16: switch from board T
("Idea D: smaller dog circle in the top corner, wordmark left," with Welcome's 244px cream
circle + speech bubble) to board S's "Idea C," stated reason **simpler**. This file is the
buildable spec for board S, standing in for the design canvas since board S only exists as a
one-line title in `docs/features/UX Redesign.html` and is listed as "reference only, do not
build" in the handoff's source-of-truth table — that call is explicitly reversed by this doc.
Where this doc's reasoning is inference rather than something traceable to prose/an asset, it's
flagged as such rather than stated as fact.

**Partially superseded, 2026-10-16 (same day) — current source of truth is `requirements.md`'s
"Brand and logo" scope item.** This doc's small, unified 44px/34px `BrandRow` treatment was built
exactly as spec'd below, then the user corrected Welcome and Home's title back toward board T's
original scale after seeing it live: Welcome now uses a bespoke ~196×196px sticker card at the dog's
original 164×121px size, with the "Divide by 6?" bubble restored (this doc's §3 incorrectly dropped
it — board S2's title, "Idea C ... beside the bubble," should have been read as evidence the bubble
belongs to base Idea C, not just its S2 variant); Home's title reverted to a bare, bigger (150×42px,
not 112×31px) wordmark with no icon. **Only §1's first-run-card guidance below is still accurate** —
that placement still uses this doc's small `BrandRow size="compact"` unchanged. §2's brand-row layout
and §4's sizing table no longer apply to Welcome or Home's title; don't build them for those two
placements.

This supersedes the brand-mark portions of `design.md` §3 (Welcome), §4.1 (Home title), and §4.2
(Home first-run badge). Everything else in those sections (headline/paragraph/buttons on Welcome,
template shelf, Ongoing/Completed sections, first-run card copy) is unchanged — only the brand
mark's own treatment changes, per the task's explicit instruction not to drop surrounding content.

## 1. The sticker card — reused geometry, not invented

"The original sticker card" is the pre-board-T Miso photo treatment from
`docs/features/ux-revamp/design.md` §2–§3: *"Miso art, tilted slightly (~-3.5°), in a small white
rounded-card frame with a shadow — a snapshot-on-paper feel"* (Welcome), miniaturized on New-trip
as *"the same face-crop, ~28px square, in a white `rounded-[10px]` frame with ~4px padding and
`shadow-card-sm`, tilted slightly (~-6°)."* That construction — white/`card` fill, `10px` radius,
small inner padding, `shadow-card-sm` — is reused verbatim as the housing for the new flat
dog-face mark:

- **Fill**: `card` token (white).
- **Radius**: `10px` (exact value from the original sticker card — not this feature's 14px trip-
  icon-tile radius; the sticker predates that scale and the task explicitly asks to reuse the old
  card's value when found, which it was).
- **Padding**: `5px` inside the tile (midpoint of the original's "~4px").
- **Shadow**: `shadow-card-sm` (same token the original used).
- **Border**: none — matches `card-border: transparent`, consistent with every other card in this
  feature's token table.
- **Tilt: dropped.** This is the one deliberate deviation from "the original," stated explicitly
  rather than silently: the original sticker's tilt worked as a one-off decorative flourish (a
  snapshot tucked at an angle on a single empty-state or header cameo). Board S repurposes the
  same card as a **persistent, repeated chrome element** — it now appears in the title row of
  Welcome and Home, rendered on every load. A tilted icon in a title row would read as crooked
  chrome rather than a styling choice, and "simpler" was the user's own stated goal for switching
  to board S in the first place. **Flagging this as a call made, not confirmed against a canvas**
  — if board S's actual artwork does show a tilt, that's a one-line change back, not a rework.

## 2. The brand row — icon tile then wordmark, reusing `TripRow`'s own icon+text convention

"Wordmark as a brand row" reads as a single horizontal row: **icon tile, then wordmark**, in that
order — not wordmark-then-icon. This isn't an arbitrary pick: it's the same left-to-right
icon-first convention already used everywhere else in this app's row anatomy (`TripRow`'s icon
tile → name, the `TopBar`'s icon-then-label groupings, `you-identity-card.tsx`'s avatar-then-name
row) — all built on `flex items-center gap-3`. The brand row reuses that exact pattern rather than
inventing new row markup:

```
[ sticker-card dog icon ]  12px gap  [ wordmark ]
```

- **Layout**: `flex items-center gap-3` (12px gap — the app's standing icon+text gap value, not a
  new number).
- **Vertical alignment**: center (`items-center`), so the tile and the wordmark's baseline-area
  sit visually balanced regardless of the wordmark's internal leading.
- **Order**: sticker-card tile first (left), wordmark second (right) — icon-then-text, matching
  the convention above.

### Sizing per placement

The wordmark asset itself keeps its existing fixed export dimensions (never stretched, uniform
scale only — carried over from board T's own rule, requirements AC4). The sticker tile is sized to
match each placement's wordmark height, with the dog-face icon scaled inside it at its native
164:121 aspect ratio:

| Placement | Wordmark | Sticker tile | Dog-face icon inside tile |
|---|---|---|---|
| Welcome brand row | 150×42px (unchanged dims) | 44×44px (10px radius, 5px padding) | ~34×25px, centered |
| Home title (board A) / Home first-run header | 112×31px (unchanged dims) | 34×34px (10px radius, 4px padding) | ~26×19px, centered |

Both tiles use the same radius/padding/shadow ratio as §1 — only the overall square size scales
down for the smaller wordmark, the same way the original sticker card itself scaled from a bigger
Welcome treatment down to a ~28px New-trip miniature without changing its construction.

## 3. Welcome — what replaces board T's circle and bubble

Board T's Welcome-specific elements are removed:
- The 244px cream (`logo-plate`) circle bleeding off the top-right corner — gone.
- The "Divide by 6?" tilted speech bubble — gone.
- The separate 164×121px dog-face-in-circle composition — gone, replaced by the dog-face icon
  living inside the sticker tile per §2.

What replaces it, top to bottom, in place of board T's circle+bubble block:
1. **Brand row** (§2, Welcome sizing): sticker tile + wordmark, left-aligned, sitting where the
   circle used to start the page. No change to horizontal page padding.
2. Headline (unchanged, decision #1 — kept verbatim): **"You have fun.\nMiso does the math."**
3. Paragraph (unchanged): **"Add what you spend. Miso works out who owes who — no account needed
   to start."**
4. Template shelf, buttons, sign-in link — all unchanged from `design.md` §3, steps 4–7.

**Status-bar legibility note (flag for requirements):** AC8's "status-bar text stays legible over
the cream circle" was written specifically for board T's circle bleeding under the status bar.
Board S has no circle there, so that specific concern no longer applies — but it also means the
status bar now sits over whatever `Screen`'s plain `glow`/`texture` background renders at the top
of the page, same as every other screen. This should read as a simplification (one less thing to
check), but the requirements doc's AC8 language should be updated to drop the now-stale
circle-specific clause rather than quietly becoming untestable — **flagging for the PM/requirements
pass, not resolved here.**

**Responsive — 390/320px**: the brand row's fixed-size tile (44px) and wordmark (150×42px, scale
only) have no reflow risk at either width — simpler than board T's bleed-geometry check, which had
to confirm `overflow-clip` behavior at 320px; board S removes that check entirely.

## 4. Home title, Home first-run, and the "unify three treatments into one" question

Board T used three different brand treatments because its circle motif didn't fit every
placement (big circle+bubble on Welcome, small dog-in-circle on the first-run card, wordmark-only
on Home title). Board S's simpler icon-tile+wordmark composition **can** unify Welcome and Home's
title row into one lockup — both now render the exact same brand row (§2), just at the two sizes
in the table above. That is a real simplification and matches the user's stated reason for
switching boards.

**Home title (board A)** — supersedes `design.md` §4.1's "wordmark title... replacing today's
plain 'Trips' h1, AC4" line: render the brand row (sticker tile + 112×31px wordmark) in `TopBar`'s
leading slot instead of wordmark-only. This is a **content change** from board T's explicit AC4
("no dog mark next to the title on either [Home or Home first-run]") — flagging it as such rather
than slipping it in quietly, since AC4 will need to be rewritten, not just re-pointed at a new
board.

**Home first-run "No trips yet" card badge — resolved (user decision, 2026-10-16): full brand row
(icon + wordmark), not icon-only.** The user confirmed every brand placement should render the
identical row from §2 (sticker tile + wordmark), including this card, despite the Home title
showing the wordmark one scroll-length above — consistency across every placement wins over
avoiding the repeated word. The card's badge therefore swaps its current 64px-circle-with-46px-dog
housing for the full brand row (sticker tile + wordmark) at a size consistent with the card's
existing badge scale, not just the icon tile alone.

## 5. Raster-stopgap / SVG-master note

Same underlying art asset, same open item as board T (requirements decision #2): the dog-face mark
is still the held 1254px raster with PNG-cutout edge artifacts; board S doesn't touch that
dependency at all, since it reuses the same `DogFace`/`Wordmark` asset components board T already
renders (`src/components/brand/dog-face.tsx`, `src/components/brand/wordmark.tsx`), just inside a
smaller tile at a different page position. **This open item carries forward unchanged and
unresolved** — still flagged to design/user, not resolved by this doc, and if anything board S
*lowers* the urgency slightly since the dog-face now renders consistently small (34px/26px) rather
than at Welcome's larger 164px hero size, making raster artifacts less visible — but the SVG master
is still the right fix, not something this doc substitutes for.

## 6. Constraints satisfied (compliance baseline)

Checked against `docs/reviews/security-compliance/project/compliance-baseline.md`; no
`compliance-constraints.md` exists for the `redesign-ui` slug (confirmed, same as `design.md` §6).

- **No new personal data, processor, or outbound message.** This doc only repositions/resizes
  existing brand assets (`DogFace`, `Wordmark`) into a different container shape. No new input,
  field, analytics event, or send path.
- **Consumer-facing claims rule**: no new copy is introduced by this doc at all — the brand row is
  purely a visual asset lockup (an icon tile + an existing wordmark graphic), carrying no text of
  its own. Welcome's headline/paragraph, Home's section labels, and the first-run card's copy are
  all unchanged from `design.md` (§3/§4.1/§4.2) and were already cleared there.
- **Sender identity / consent / opt-outs**: not applicable — no communication path is touched.
- **Money records**: not applicable — this doc touches no financial display or amount.
- **Stale-claim recheck**: board T's two stat chips were already removed in `design.md` §3 (AC8);
  board S doesn't reintroduce them or any other claim-adjacent element.

No item in this spec requires escalation to the compliance agent beyond the design-stage review
already satisfied by `design.md` §6.

## 7. Consistency with existing screens

- **Sticker card**: reused verbatim from the pre-redesign Miso cameo construction in
  `docs/features/ux-revamp/design.md` (§2/§3) — `card` fill, `10px` radius, small padding,
  `shadow-card-sm` — not a new card shape invented for this feature.
- **Brand row layout**: reuses the app's standing icon-then-text row convention
  (`flex items-center gap-3`), the same pattern `TripRow` (`src/app/trips/page.tsx`),
  `TopBar` (`src/components/ui.tsx`), and `you-identity-card.tsx` already use — not a bespoke
  flex arrangement.
- **Deliberate deviation, stated**: the original sticker card's tilt is dropped for the brand row
  (§1) because it's now persistent chrome rather than a one-off cameo — called out explicitly
  rather than silently dropped.
- **Open items carried/raised here**: AC8's status-bar/circle clause needs a rewrite (§3); AC4
  needs rewriting since Home title now shows a dog mark (§4); the SVG-master open item (decision
  #2) carries forward unresolved (§5); whether the first-run badge should get the full
  icon+wordmark row or icon-only is a judgment call flagged for confirmation (§4).
