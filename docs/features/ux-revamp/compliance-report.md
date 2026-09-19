# Compliance review — ux-revamp

Scope: the just-implemented ux-revamp feature (`docs/features/ux-revamp/requirements.md`,
`architecture.md`, `design.md`) — a presentation-layer restyle of four existing
screens (Welcome, Create a trip, The trip, Add an expense), a new "warm paper"
visual theme, the first appearance of the Miso mascot, and add-expense's
conversion from a page to an overlay sheet. Reviewed against
`docs/ARCHITECTURE.md`'s data model to assess the delta only, and against the
existing whole-app findings in `docs/compliance-review-2026-09-17.md` to
confirm this feature doesn't newly touch or worsen them.

I'm flagging exposure, not redesigning the feature. This is not legal advice
and does not substitute for the user's own counsel — items marked "needs
legal sign-off" are real open legal questions, not something I'm resolving
myself.

**Update (2026-09-18):** the one blocking finding (§1, unused Miso source
images sitting in `public/`) has been fixed by the engineer and independently
re-verified below. The genuinely-ambiguous mascot item (§2) is not resolved
(nor is it meant to be resolved by this review) but has been explicitly
decided-and-tracked by the user rather than left open by default — see the
updated note under §2. **Overall verdict: this feature is clear to ship.**
See "Bottom line" and "Summary" below for the current state.

**Update (2026-09-18, follow-up review):** after the above was written, a
separate concurrent session swapped the actual shipped Miso asset to the
full, uncropped `public/images/miso_01.jpg`. This is a different kind of
issue from §1 (a live, referenced, shipped asset vs. an unused file) and is
reviewed fresh in the new section below, "Follow-up review (2026-09-18): full
uncropped Miso photo shipped to production," placed after §2. It does not
change this feature's overall clear-to-ship verdict; see that section and the
updated Summary/Final verdict for specifics.

---

## Bottom line

This feature is what requirements/architecture/design describe: a CSS/markup
restyle plus a routing-mechanism change for one screen. **No new personal
data is collected, no new data lives anywhere new, no new third-party
processor is introduced, and financial-record accuracy/immutability is
unaffected** (AC10/AC16, confirmed in architecture.md's "Data model impact"
section: no schema/RLS/API changes; add-expense's validation/submit logic is
relocated, not rewritten). The pre-existing whole-app gaps (no privacy
policy/ToS, no deletion/export flow, no retention policy for abandoned
anonymous accounts — `docs/compliance-review-2026-09-17.md` §1-3) are
correctly out of scope per this feature's non-goals and are neither resolved
nor worsened by it.

There was **one blocking-adjacent item fixed before merge** (unused source
images with confusing baked-in text sitting in `public/` — now moved out and
verified, §1) and **two items that are genuinely ambiguous enough to need
legal/product sign-off** rather than a guess from this review (AI-generated
mascot art disclosure and its IP/ownership status as a permanent brand
asset — the user has made an interim decision on how to proceed while that
sign-off is pending; see §2). Nothing else rises above advisory.

**Current status: no open blockers. Feature is clear to ship.**

---

## Blocking / fix-before-merge

### 1. Unused source Miso images in `public/images/` should not ship — RESOLVED, verified 2026-09-18

`public/images/miso-1.png` and `public/images/Miso-2.png` are the two
full-resolution AI-generated source images design.md §6.1 describes:
photorealistic "dog at a desk" stock-style art, each with its own unrelated,
legible-at-hero-size baked-in background text (`miso-1.png`: a whiteboard
reading "Group Trip Expenses" and a mug reading "Accounts Paw-trol";
`Miso-2.png`: a whiteboard reading "Expense Reconciliation" and a New York
skyline). I confirmed by direct image inspection that this baked-in text is
present and reads clearly, not just a background detail. Neither file is
referenced anywhere in `src/` (confirmed by grep — only
`public/images/miso-welcome.jpg`, the cropped stopgap, is imported, in
`src/app/home-screen.tsx`).

**Why it matters:** Next.js serves everything under `public/` verbatim at
its literal path, regardless of whether any app code references it — being
"unreferenced by shipped code" does not mean unreachable. If these two files
are committed and deployed, `/images/miso-1.png` and `/images/Miso-2.png`
become directly loadable URLs on the production domain, exposing
work-in-progress AI-stock art with off-brand, confusing text (a mug/whiteboard
referencing a made-up "Accounts Paw-trol" team and unrelated numbers) that
was never meant to be public-facing. This isn't a data-privacy problem — no
personal data is in these images — but it is a real, concrete exposure this
review can specify precisely rather than leave as a vague "clean up your
assets" note: per the git status at the start of this review, `public/` is
currently untracked, so this is fixable before it's ever committed.

**Mitigation:** before committing/merging, either (a) delete
`public/images/miso-1.png` and `public/images/Miso-2.png` from the working
tree entirely (nothing in the shipped app needs them — `miso-welcome.jpg`,
the already-cropped derivative, is the only asset in use), or (b) if they
need to be retained as source material for the "swap in final-resolution
assets" fast-follow mentioned in design.md §6.1/requirements.md open question
3, move them out of `public/` (e.g. into
`docs/features/ux-revamp/design-import/` or another non-served location) so
they aren't part of the Next.js static-asset surface. This is a one-line fix
for the engineer, not a design or architecture change.

**Verification (2026-09-18, independent re-check):** the engineer moved both
files (plain filesystem move) to
`docs/features/ux-revamp/design-import/miso-1.png` and
`docs/features/ux-revamp/design-import/Miso-2.png`. I independently confirmed:

- `public/images/` now contains exactly two files —
  `miso-welcome.jpg` and `paw-texture.svg` — neither
  `miso-1.png` nor `Miso-2.png` is present anywhere under `public/`. No other
  unintended files are in `public/images/`, so there's no remaining exposure
  of this kind in that directory.
- `docs/features/ux-revamp/design-import/` now holds both moved files
  alongside the design-import canvas/README, which is a docs path, not a
  Next.js-served path — files here are not reachable at any production URL.
  The design-import README's own "Known gap: mascot art assets" section
  independently corroborates these are pre-final source assets awaiting
  proper re-export, consistent with treating them as import material rather
  than shippable assets.
- A grep for `miso`/`Miso` across `src/` still returns only
  `src/app/home-screen.tsx`, which references `/images/miso-welcome.jpg`
  only — the relocation did not touch or break the reference to the actual
  in-use asset.
- I opened `public/images/miso-welcome.jpg` directly and confirmed it
  renders as expected (the cropped Miso face illustration used on the
  Welcome screen) — the file itself is intact and unaffected by the sibling
  files' move.

No remaining exposure from this finding. **Status: resolved.**

*(Note, 2026-09-18 follow-up: `miso-welcome.jpg` referenced above has since
been superseded twice more — first by `miso-avatar.png`, then by the full
`miso_01.jpg` currently shipping. See the new section below for the current
asset. This does not reopen §1: the specific unused files this finding was
about remain out of `public/`, confirmed again in that section.)*

---

## Needs legal/product sign-off (genuinely ambiguous — not a call this review makes)

### 2. AI-generated imagery as a permanent brand mascot — disclosure and IP status

Miso's art (`miso-1.png`, cropped to `miso-welcome.jpg`) is confirmed
AI-generated per design.md §6.1 and the design-import README, and
design-import/README.md's "Decisions made with the user" section confirms
Miso is intended as "a real, permanent brand element," not a one-off
placeholder. Two distinct open questions follow from that combination that I
can flag but not resolve:

- **Disclosure.** Some jurisdictions have (or are developing) rules requiring
  disclosure that image content is AI-generated/synthetic in certain contexts
  (e.g. the EU AI Act's Article 50 transparency obligations for synthetic
  media, and a growing number of US state-level AI-content-labeling laws).
  Whether a stylized cartoon mascot used in ordinary product marketing falls
  under any such requirement — versus being exempt as "evidently
  artistic"/non-deceptive content — is a jurisdiction-specific legal
  conclusion, not something this review should guess at given Splitiful's
  stated global user base. **Needs legal sign-off**: does any target
  jurisdiction's AI-content-disclosure rule apply to a permanent,
  AI-generated brand mascot, and if so, what disclosure (if any) is required
  and where.
- **IP/ownership.** Copyrightability of AI-generated output is unsettled and
  varies by jurisdiction (e.g. US Copyright Office guidance generally denies
  copyright protection to content without sufficient human authorship). If
  Miso becomes a permanent, defended brand asset, Splitiful may have limited
  or no ability to prevent a competitor from copying the same or
  similar-looking mascot art. There's also a separate question of whether the
  specific AI tool/service used to generate the source images has its own
  terms of service governing commercial/brand use of its output — worth
  confirming those terms permit this use before treating Miso as a permanent
  mark, since "permanent brand element" is a materially higher-stakes use
  than a one-off illustration. **Needs legal sign-off**: both the
  copyright/trademark protectability question and the generating tool's ToS
  for commercial brand use.

Neither of these blocks shipping the current slice (welcome-screen art only,
per AC13), but both should be closed out before more investment goes into
Miso as a brand identity (naming rights, merchandising, expanded appearances
across screens, etc.), since unwinding a mascot after further investment is
more costly than confirming this now.

**User decision (2026-09-18):** proceed with this feature now; revisit this
item before any real launch/marketing push for Miso (as opposed to getting a
legal opinion first, or dismissing the concern outright). Tracked in
`docs/ROADMAP.md` as a follow-up so it isn't lost.

**Status note (2026-09-18):** this is a recorded product decision made by the
user with the tradeoff stated above — it is not a legal conclusion, and this
review is not endorsing "proceed without disclosure/IP review" as
legally sound, only confirming the decision is deliberate, documented, and
gated on a concrete future trigger (any real launch/marketing push) rather
than silently dropped. Re-flag this item for legal review before that
trigger is hit. Not a blocker for this feature as scoped (welcome-screen art
only).

**Addendum (2026-09-18, follow-up review):** see the new section immediately
below for one additional fact (a visible third-party trademark) that belongs
in the scope of this same sign-off item, discovered when reviewing the
full-photo asset swap. It does not change this item's status or trigger —
still not a blocker, still gated on the same pre-launch/marketing point —
it's an addition to what the eventual legal review should look at.

---

## Follow-up review (2026-09-18): full uncropped Miso photo shipped to production

**Context.** Independent of the review above, an unrelated concurrent
session replaced the shipped Miso asset with `public/images/miso_01.jpg` —
the full, uncropped AI stock photo, not the cropped `miso-avatar.png`
circular avatar §2 above was written against. Confirmed by grep, it's
referenced in exactly four places: `src/app/home-screen.tsx` (Welcome,
rendered at 96×96 in a tilted card), `src/app/trip/new/page.tsx`
(Create-a-trip, 28×28), `src/app/trip/[id]/trip-tabs.tsx` (Trip-view
empty state, 24×24), and
`src/app/trip/[id]/add-expense-sheet-content.tsx` (Add-expense header
badge, 26×26, `aria-hidden`). `design.md` §6.1's 2026-09-18 "superseded by a
separate concurrent session" update records that when this was surfaced,
the user explicitly chose to keep the full photo as shipped, rather than
reverting to the cropped avatar or cropping out just the text.

This is reviewed here as a new finding, not a re-check of §1: §1 was about
incidental exposure of *unused* files sitting in `public/`, trivially fixed
by deletion. This is the app's *actual, deliberately-referenced, shipped*
image, displayed to every real user on four screens — a different kind of
issue even though it's the same category of source material.

**What's actually in the image**, confirmed by opening the file directly: a
dog wearing glasses, in a sweater, at a laptop, with — legibly, in the
background — a whiteboard reading "Good Systems Better Outcomes," sticky
notes ("Analyze / Build / Improve / Make it Easier"), a mug ("Small Steps
Big Impact"), a spiral notepad ("Today: Reconcile expenses / Review
exceptions / Update deck / …sync"), a water bottle ("Bay Area Dog Mom &
Product P[erson]"), a stack of business-book spines, a clearly visible Apple
logo on the laptop lid, and a Golden Gate Bridge/city-skyline view through a
window.

**1. Consumer confusion / implied claims — reviewed, no compliance issue.**
None of the baked-in text reads as a claim *about Splitiful*. It's generic
stock-photo flavor (self-help business-book jargon, an unrelated "dog mom"
water-bottle joke) sitting behind a cartoon mascot, not copy the app itself
is asserting. The one line that's thematically adjacent to the product
("Today: Reconcile expenses / Review exceptions") is coincidental — there's
no "exception review" or "deck" feature in Splitiful for it to misdescribe —
and in context (background clutter behind a dog in glasses at a laptop) I
don't think a reasonable user would read it as a representation about the
product's capabilities, security, or data handling. This is a
legibility/brand-polish problem, not a misrepresentation problem. I want to
be straightforward that I don't think this clears the bar for a
consumer-protection finding, and I'm not inflating it into one just because
the content is odd.

**2. AI-content-disclosure question (already tracked in §2) — status
unchanged, one nuance worth recording.** If anything, the full,
obviously-composited scene — a dog in a sweater and glasses at a laptop,
with a stylized bridge-and-skyline backdrop, prop stickers, and
book-spine-sized background text — reads more evidently as
synthetic/illustrative art than a tight face crop would. A tight crop could
plausibly be mistaken at a glance for "a photo of a real dog"; the full
scene's obvious, slightly surreal compositing is much harder to mistake for
an unmanipulated photograph. Some disclosure frameworks carve out content
that's "evidently" artistic or synthetic from labeling requirements, and
that distinction is arguably more favorable here than for a cropped
version. That's a reason this question might resolve more easily, not a
reason to skip asking it — this doesn't change §2's tracked status or
trigger, it's a fact for whoever eventually does that legal review to weigh.

**3. New fact for the same sign-off item: a visible third-party
trademark.** The laptop's Apple logo is clearly visible in the shipped
image, now baked into a permanent, high-frequency, commercially-shipped
brand asset (rendered on every load of four screens) rather than a one-off
editorial photo. This is a different flavor of IP question than §2's
original framing (whether Splitiful can protect *its own* mascot art) — it's
the reverse: whether Splitiful bears any exposure for depicting *someone
else's* mark without permission. In practice this kind of incidental,
non-mocking, non-competing brand depiction is extremely common in
AI-generated stock imagery, and the realistic likelihood of enforcement from
a company like Apple over it is low — but low isn't zero, and it's a
concrete, checkable fact that belongs in front of whoever eventually signs
off on §2, rather than something discovered later. **This adds to the scope
of §2's existing "needs legal sign-off" item; it is not a new blocker and
does not change that item's trigger.**

**4. Full-resolution exposure isn't mitigated by small on-screen
rendering.** All four placements render the image at 24–96px via a plain
`<img>` tag (`next/image` is explicitly not used, per comments in each
file, since there's no config for `public/images/*` yet) — that constrains
only the CSS layout box, not the bytes served. I opened the file directly
and confirmed it is the full source-resolution photo; nothing in the code
path down-samples it before serving. Any user can see the entire scene at
full size with an ordinary right-click "Open image in new tab," or by
loading `/images/miso_01.jpg` directly — the same underlying fact pattern
as §1 (a `public/` path is reachable at its literal URL regardless of how
small a page renders it), except this time the file is load-bearing to the
shipped UI, so "just delete it" — §1's fix — isn't available here. This
isn't, on its own, a new legal exposure (per #1 above, the content itself
isn't the kind of thing that creates liability merely from being seen at
full size), but it's worth stating plainly for anyone who might assume
small on-screen display is a containment measure: it isn't.

**5. Minor accuracy nit, not a compliance finding.** Welcome's alt text
(`src/app/home-screen.tsx`) reads "Miso, Splitiful's mascot dog, wearing
glasses at a desk with a calculator" — there's no calculator in the image,
it's a laptop. Screen-reader users get a description that doesn't match
what's actually shown. Low-stakes since the image is decorative rather than
information-bearing, but a one-line copy fix worth bundling in next time
this file is touched.

**Verdict on this specific decision.** Clean in the areas that would
actually create legal/regulatory exposure: no personal data involved, no
claim a user could reasonably rely on, no effect on the account-deletion/
export gap or financial-record accuracy. The previously-tracked mascot
disclosure/IP item (§2) is unchanged in status and trigger but gains one
concrete new fact — the visible Apple logo — that the eventual sign-off
should account for. Everything else here (legibility of incidental text,
tonal mismatch, "why does a trip-expense app's mascot have a business-book
collection and a Bay Area dog-mom water bottle") is a product/brand-quality
question the user has already made a deliberate, informed call on — not a
legal exposure I can identify, and not one I'm reopening or second-guessing
by writing this section. My job here is to confirm there's no hidden
compliance cost beyond what's already tracked, and there isn't.

**This is not a blocker.** No new item added to the blocking list; §2's
existing needs-sign-off item gains one fact, same status, same trigger.

---

## Reviewed, no issue found

### 3. Welcome headline copy ("Miso does the math") — no new consumer-facing claim

Checked design.md §2/§6.3 and the shipped copy in `src/app/home-screen.tsx`
against actual app behavior. The new headline ("You have fun. Miso does the
math." / "Add what you spend. Miso works out who owes who — no account
needed to start.") personifies the split calculation through a named
mascot, but doesn't assert anything materially different from the prior
shipped copy ("Trips are fun. The math isn't." / "We'll work out who owes
who…"): both versions claim the app computes who-owes-whom, which is exactly
what it does (a straightforward equal-split computation in
`src/lib/settlement.ts`, unchanged by this feature). Personifying that
computation as "Miso" doesn't create an implied warranty of automated
correctness, financial advice, or liability shift beyond what any
expense-splitting tool's basic value proposition already implies — it's
attribution of an existing, accurately-described feature to a character, not
a new representation about accuracy, security, or data handling. I don't see
a consumer-protection exposure here. One thing worth keeping in mind
prospectively (not a finding against this feature): if a future feature
attributes a *specific dollar figure* to Miso in first-person voice (the
excluded "Miso says that's $206.67 each" callout, correctly cut per AC12),
an error in that number would read as a more personal/branded
misstatement than a plain UI label would — worth remembering if AC12's
exclusion is ever revisited, but it is explicitly not built here, so no
action needed now.

### 4. Data privacy / third-party processors / retention — no change

Confirmed via `docs/features/ux-revamp/architecture.md`'s "Data model
impact" section (no schema, RLS, or API changes) and by inspecting the
actual diff surface described there: this feature touches CSS/tokens, shared
UI-component variants, and Next.js routing structure (intercepting/parallel
routes for the add-expense sheet) — no new field is collected, no existing
field is sent to a new destination, and no new vendor is introduced. The
existing hide-until-verified organizer gating and the three-tier
read-access model (`docs/ARCHITECTURE.md`'s auth-model section) are
explicitly preserved as-is (AC6, AC16) — pre-verification visibility of
trip/expense data is unchanged by the sheet conversion or the restyle. The
whole-app gaps already tracked in `docs/compliance-review-2026-09-17.md`
(no privacy policy, no deletion/export path, no retention policy for
abandoned anonymous accounts) are unaffected — this feature adds no new
personal data for those gaps to cover, so it doesn't widen them, and
resolving them remains correctly out of scope per this feature's non-goals.

### 5. Financial recordkeeping — unaffected

AC10 requires (and architecture.md's Decision 2 confirms) that
`isUnverifiedOwner`, `requireVerifiedSession`, `isValidExpenseInput`, and
`addExpense` are relocated into a shared component unchanged, not rewritten.
The sheet-vs-page container change doesn't touch how an expense is
validated, submitted, or stored, and doesn't add any new edit/delete path.
No new risk to the accuracy or immutability of the expense record.

### 6. Add-expense deep-link/back-button behavior — no data-exposure regression

The intercepting/parallel-route mechanism (ADR 0008) preserves
`/trip/[id]/add-expense` as a real, independently-loadable URL (AC8) and
routes the hard-nav fallback through the same tiered-fetch/gating logic as
the trip page (owner-gate redirect, locked-trip state) rather than a new
code path. Reviewed for whether the new `layout.tsx`/`@sheet` parallel-route
scaffold could leak the sheet or any owner-gated content to
`settle-up`/`invite`/`feedback`/`expense/[expenseId]/edit` (all newly nested
under the same layout per architecture.md's "Routes newly wrapped" note) —
the `@sheet` slot's catch-all/default routes return `null` and the dimming
logic only activates on a pathname ending in `/add-expense`, so no new
exposure surface for those other routes' own (unchanged) access control. No
compliance concern; architecture.md already flags this for QA smoke-testing
on non-functional/regression grounds, which is the right place for it.

---

## Summary

**Blocking (fix before merge):**
1. ~~Delete or relocate `public/images/miso-1.png` and `public/images/Miso-2.png`
   out of `public/` before committing~~ — **RESOLVED, verified 2026-09-18.**
   Both files confirmed moved to `docs/features/ux-revamp/design-import/`
   (a non-served path), `public/images/` confirmed to contain only
   `miso-welcome.jpg` and `paw-texture.svg`, and `miso-welcome.jpg` confirmed
   to still render correctly and be the only Miso asset referenced in
   `src/` (§1). *(That asset has since been superseded twice more by later,
   unrelated sessions — see the follow-up section — but the specific files
   this finding addressed remain out of `public/`.)*

**Needs legal/product sign-off (not resolved here — status noted, not a blocker):**
- Whether any target jurisdiction's AI-generated-content disclosure rules
  apply to Miso as a permanent brand mascot, and what disclosure (if any) is
  required (§2). User has decided to proceed now and revisit this before any
  real launch/marketing push for Miso; tracked in `docs/ROADMAP.md`. This is
  a documented product decision, not a legal conclusion — still needs actual
  legal sign-off before that trigger is hit.
- Copyright/trademark protectability of the AI-generated mascot art as a
  defended brand asset, and whether the generating tool's terms of service
  permit this commercial/brand use (§2). Same status as above.
- **New (2026-09-18 follow-up):** the full, currently-shipped
  `miso_01.jpg` contains a clearly visible Apple logo — add this to the
  scope of the above sign-off item (third-party trademark exposure, not
  just Splitiful's own IP position). Same status, same trigger, not a new
  blocker.

**Reviewed, no issue found:**
- The Miso-attributed welcome headline copy does not create a new
  consumer-facing claim or liability exposure beyond the prior copy (§3).
- No new personal data, processor, or retention gap introduced; existing
  whole-app compliance gaps from `docs/compliance-review-2026-09-17.md` are
  untouched, not worsened (§4).
- Financial recordkeeping (expense validation/submit/immutability) is
  unaffected by the sheet conversion (§5).
- No new access-control exposure from the shared `layout.tsx`/`@sheet`
  scaffold now wrapping other, out-of-scope routes (§6).
- **New (2026-09-18 follow-up):** the full uncropped `miso_01.jpg` now
  shipping does not create a new consumer-confusion or false-claims issue —
  its baked-in text is generic stock-photo flavor, not a claim about
  Splitiful. The full/obviously-composited scene may read more favorably
  under "evidently synthetic" disclosure carve-outs than a tight crop would,
  though that's a nuance for the legal review, not a resolved conclusion.
  The one accuracy nit (Welcome's alt text mentions a calculator that isn't
  in the image) is advisory only.

---

## Final verdict (2026-09-18)

**Clear to ship.** The only blocking finding (§1) is fixed and independently
verified — no unintended public-image exposure remains from those specific
files. The mascot disclosure/IP item (§2) was never a blocker for this slice
(welcome-screen art only) and now has a documented, deliberate user decision
with a clear future trigger for revisiting it, rather than being silently
open or ignored. The follow-up review of the full-photo asset swap (see
above) does not surface a new blocker: no personal data, no actionable false
claim, no change to the pre-existing whole-app gaps — it adds one concrete
fact (a visible Apple logo) to the scope of the already-tracked §2 sign-off
item, and confirms the rest of the concern is product/brand-quality, which
is the user's call to make and has already been made. No other concern in
this review rises above advisory. This verdict covers this feature's scope
only — it does not clear the pre-existing whole-app gaps tracked in
`docs/compliance-review-2026-09-17.md`, which remain open and out of scope
here.
