# Starter lists: breakdown into smaller features (DRAFT for review)

Current version: 0.7.0. Versions below are tentative (minor bump per user-visible feature). Light mode only for now; dark follows each piece.

Amended 2026-10-14 (user feedback on the built app): items #5 and #6 are pulled forward from 0.8.1 into 0.8.0. See requirements.md Revision 3.

| # | Feature | Canvas | Tentative version | Why this version |
|---|---------|--------|-------------------|------------------|
| 1 | Trip types on New trip: pick any of Camping / Airbnb stay / International, or none; stored on the trip | B | 0.8.0 | Foundation for everything else; needs one DB column and a `create_trip` change, so it should ship first and alone. Nothing visible in the List yet. |
| 2 | Suggested card on the List tab: merged, deduped suggestions from a bundled catalog, "+" per item | C | 0.8.0 | Delivers the user value of #1; they only make sense together. Needs no new RPC (uses the existing insert). Catalog content must be agreed first. |
| 3 | Add all N (one-tap add of remaining suggestions) | C, I | 0.8.1 | Small follow-up on #2 using the existing multi-row insert. Held back so #2 can be verified on its own. |
| 4 | Undo toast on Add all (removes only that batch, skips claimed items) | I | 0.9.0 | Needs a `batch_id` column and a batch delete, so it is a schema change. Not needed for #1–3 to be useful. |
| 5 | Template tiles on `/trips` and the welcome page `/` (Camping / Airbnb / International) that open New trip pre-checked, plus "Blank trip" and the bottom "New trip" pill | A | **0.8.0** (pulled forward 2026-10-14 after user feedback) | UI only once #1 exists. Added to `/` too because new organizers are anonymous and never reach `/trips`. |
| 6 | First-run state: "No trips yet" card on `/trips` | L | **0.8.0** (pulled forward 2026-10-14) | Tiny; ships with #5 because it sits on the same screen. |
| 7 | Name-only analytics for the events above + success-measure DB query | n/a | 0.8.0 (events), 0.9.0 (query) | App only supports event names, no IDs. Events ride along with each feature; the "5+ items in a day" query is separate admin work. |
| 8 | Copy a past trip's list into an empty list (D/E/F empty states + one-tap Copy + toast) | D, E, F, G | 0.10.0 | Riskiest: cross-trip read, new bulk RPC, security and compliance review. Independent of #1–3, so it can wait. |
| 9 | Undo on Copy | G | 0.10.0 | Same batch mechanism as #4; ships with Copy. |
| 10 | Share a list by link (sender) | H | 0.11.0+ | Phase 2 in the guide. Needs link service, expiry/revoke decisions, and a Share icon in the trip header. |
| 11 | Open a shared link: start new trip or add to existing | J, K | 0.11.0+ | Depends on #10 and a sign-in handoff. |
| 12 | Item notes on suggestions | n/a | Later | Needs a schema change for a nice-to-have; names only for now. |
| 13 | Dark mode for each screen above | all | Follows each piece | Deferred by you; build light first, dark right after. |

## Suggested build order
0.8.0 = #1 + #2 + #5 + #6 (+ events, + canvas fidelity fixes) → 0.8.1 = #3 (and editing trip types) → 0.9.0 = #4 → 0.10.0 = #8, #9 → 0.11.0+ = #10, #11.

## Assumptions to confirm (defaults I will use unless you say otherwise)
- First add by a guest triggers the existing email-verification prompt (no loosening of security rules).
- Tiles go on `/trips` AND the welcome page `/` (revised 2026-10-14; new organizers never reach `/trips`).
- No notes on items.
- Catalog content: I draft Camping / Airbnb / International lists for your review.
