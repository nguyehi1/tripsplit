# Market Research — Trip/Event Expense Splitting

Date: 2026-09-09

Status: historical research. Competitor features, prices, and review data have
not been re-verified since this date. Current product direction and priorities
are in [Product principles](ROADMAP.md#product-principles-and-scope); this document
records research context, not current market facts or commitments.

Note: several sources below are SEO comparison blogs written by competing indie apps to rank for
"X alternative" searches — treat exact pricing/numbers as directional, not verified fact. The
overall pattern is corroborated across multiple independent sources, so the conclusions hold even
if individual figures don't.

## Competitive landscape

| App | Model | The catch |
|---|---|---|
| **Splitwise** (incumbent) | Free tier + Pro ($5-8/mo) | Recently gutted the free tier — 4 expenses/day cap, ads, OCR/receipt scanning fully paywalled. ~65% of recent Trustpilot reviews are 1-star, mostly about monetization creep and disappearing free features. |
| **Tricount** | Free, ad-supported | No account needed to join (one organizer creates, shares a link) — closest existing analog to what we're describing. Has been stripping features version over version (export, custom splits); just added OCR. |
| **Settle Up** | Free + cheap premium (~$3.50/mo) | Solid cross-platform, unremarkable UX, ads on free tier. |
| **Splid** | Free, no accounts at all | Deliberately minimal — closest "Partiful energy" competitor. Very bare-bones, no itemization. |
| Wave of 2026 clones (Tripsil, Spliit, HippoSplit, Splitceipt, Kittysplit, EquiSplit, etc.) | Mostly free/freemium | Signals real demand (people are actively searching "Splitwise alternative"), but also a crowded, low-differentiation field — most are utilitarian and forgettable. |

## Key findings

1. **Splitwise's paywall backlash is the biggest open door.** People are actively fleeing it over
   free-tier limits (4 expenses/day) and OCR being locked away. A generous, uncrippled free tier
   is a real acquisition lever — catching outflow rather than fighting incumbent loyalty.
2. **"No account to join" is table stakes, not a differentiator.** Tricount and Splid already do
   this.
3. **The whole category looks/feels like a spreadsheet.** Every competitor is utilitarian, even
   ugly. Nobody has brought a fun, social, event-driven aesthetic (Partiful-style) to expense
   splitting, despite the underlying event (a trip, a wedding, a bachelor party) being an
   emotionally positive one. This is probably the sharpest wedge — hard for a utilitarian
   incumbent to retrofit.
4. **Itemized OCR receipt splitting is the most-wanted, most-gated feature across the board.**
   Nobody offers it well for free. Confirms the plan to ship manual entry in v1 and OCR in v2 —
   it's a strong future monetization hook once the free core has traction.

## Candidate positioning (not yet decided)

- **"Partiful for money"** — lean into event/social design; target trip organizers who already
  use Partiful-style invites, expense splitting as the natural next screen.
- **"The Splitwise alternative that isn't a scam"** — lead with a generous free tier, target the
  visible backlash/churn directly (SEO on "Splitwise alternative" terms has clear demand).
- **Niche-first** (bachelor/bachelorette parties, ski trips, festival squads) — smaller wedge,
  easier to nail the exact UX/vibe and get word-of-mouth within one community before going broad.

## Decision

Initial rollout target at the time of this research: **personal friend group
trips**, with dogfooding before wider launch. This is historical context; see
the README and roadmap for the current product description and status.

## Sources

- [Tricount Vs Splitwise: Battle of the bill-splitting apps](https://www.getcino.com/post/tricount-vs-splitwise)
- [Tricount vs Splitwise: Which Bill Splitting App Is Better in 2026?](https://splitpilot.io/blog/tricount-vs-splitwise/)
- [The Best Splitwise Alternatives in 2026, Source-Checked · Dolio](https://dolio.org/compare/splitwise-alternatives)
- [Splitwise free limit: 4 expenses a day, then Pro at $4.99 | splitty](https://splittyapp.com/learn/splitwise-free-limits/)
- [Splitwise receipt scanning vs splitty: which OCR is better? | splitty](https://splittyapp.com/learn/splitwise-receipt-scanning-vs-splitty/)
- [Splitwise Reviews (2025) | Check if app is safe or legit](https://justuseapp.com/en/app/458023433/splitwise/reviews)
- [5 Best Apps for Group Travel in 2026 — Honest, App by App Review](https://tripsil.com/5-best-apps-for-group-travel-in-2026-honest-review-no-sponsored-rankings/)
- [Best Splid Alternative: 6 Apps Compared by Use Case](https://spliit.pro/blog/best-splid-alternative/)
- [Why We Built Splitceipt: A Better Way to Split Bills and Receipts | Splitceipt Blog](https://splitceipt.com/blog/why-we-built-splitceipt/)
