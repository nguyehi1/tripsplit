# Splitiful UX redesign: engineering handoff

Oct 16, 2026 · @Hien

## Summary

Build Splitiful, a mobile app for group trips, to match the design canvas "Starter lists exploration" in light and dark. This guide replaces the earlier [Starter Lists: Product and Engineering Guide](https://claude.ai/code/artifact/6a808e77-eca8-4e1e-a9aa-433e60235ffe), which still describes the old sticky header, the old active tab and the old settle-up flow.

What changed from the last build:

- **New brand.** The dog logo replaces the Miso photo and the text title on the Welcome screen, the Home header and the first-run card.
- **Trip screens open with a summary card** (name, dates, people, total, what you paid). It scrolls with the page and is no longer sticky.
- **Home is grouped** into Start from a template, Ongoing and Completed.
- **A trip is completed only when the organizer locks it** at Settle up, not when all balances reach zero.
- **One bottom bar style** everywhere, with a 56 px accent line on the active tab.
- **Consistent spacing** on a fixed scale (see Spacing and navigation).

Build from the canvas, not from this text, wherever the two differ. The canvas is the source of truth; this guide explains intent and the rules behind it.

## Source of truth

Design canvas: [Starter lists exploration](https://claude.ai/artifact/VxMqpRyz8jrkFp2W9WVDve). Each board shows the light phone on the left and the dark phone on the right. Build both themes.

| Board | Screen | Status |
| --- | --- | --- |
| A | Home: Splitiful, templates, Ongoing, Completed | Final |
| B | New trip: pick any types | Final |
| C | New trip list: summary, items, suggestions | Final |
| D, E, F | Empty list with 0, 1, or 2+ past trips | Final |
| G | After one tap: toast with Undo | Final |
| H | Share a list by link | Final |
| I | After "Add all": suggestions fold into the list | Final |
| J, K | Opening a shared link, add to an existing trip | Final |
| L | Home on first run, no trips | Final |
| M, N | Long list, scrolled to the end, and after "+2 more" | Final |
| O | You: account, Privacy, Terms | Final |
| Invite, Settle up, Trip complete | Invite people, provisional payments, locked trip (unlettered boards in the top row, right side) | Final |
| T | Welcome, idea D: the chosen first-launch screen | Final for layout and logo; see open decisions for the headline |
| Welcome (unlettered) | Older Welcome with the Miso photo | Superseded by T |
| P | Welcome 2a and 2b from the earlier exploration, unchanged | Reference only |
| Q, Q2, S, S2, D2 | Other ways to place the logo on Welcome | Reference only, do not build |

The canvas files are named `Main`, `NewTrip`, `ListSuggest`, `EmptyNone`, `EmptyOne`, `EmptyMany`, `AfterCopy`, `ShareList`, `AfterAddAll`, `ReceiveList`, `ReceivePick`, `HomeFirst`, `ListLong`, `ListLongOpen`, `You`, `Invite`, `SettleUp`, `TripComplete`, `Welcome`, `LogoIdeaD`, `WelcomeRef`, `WelcomeLogo`, `LogoIdeaC`, `LogoQ2`, `LogoS2` and `LogoD2`, each with a `.dc.html` extension.

## Design tokens

The app has a warm paper light theme and a dark theme with translucent glass cards. Use semantic tokens, never raw values, so both themes stay in sync. Fonts are Bricolage Grotesque (display, weights 500 to 700) and Instrument Sans (body, 400 to 600).

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| background | #f5f0e6 | #171310 | Screen |
| text | #231c12 | #f8f2e7 | Primary text |
| text muted | rgba(35,28,18,.74) | rgba(248,242,231,.72) | Section labels, secondary lines |
| text faint | rgba(35,28,18,.68) | rgba(248,242,231,.66) | Subtitles, captions |
| card | #ffffff | rgba(255,255,255,.075) | Cards, tiles |
| card border | transparent | rgba(255,255,255,.1) | Dark cards only |
| hairline | rgba(35,28,18,.08) | rgba(255,255,255,.1) | Row dividers, nav top border |
| accent | oklch(0.45 0.09 80) | oklch(0.78 0.14 86) | Active tab line, links, icons |
| accent text | oklch(0.42 0.08 80) | oklch(0.84 0.13 88) | Active tab label, plus icon |
| on accent | #ffffff | #241a08 | Text on accent fills |
| chip fill | oklch(0.95 0.04 88) | rgba(214,160,54,.16) | Trip icon tile, plus tile |
| tint | rgba(35,28,18,.05) | rgba(255,255,255,.06) | Completed trip icon tile |
| primary button | rgba(35,28,18,.9) | rgba(248,242,231,.92) | Filled buttons; text #ffffff / #1b1510 |
| nav bar | rgba(245,240,230,.72) | rgba(23,19,16,.72) | Bottom bar, with a 16 px backdrop blur |
| brand brown | #4a2d22 | #f5ecdc | Wordmark |
| logo plate | #fffaf1 | #f5ecdc | Backing behind the dog on Welcome |

The background also carries three soft radial glows (amber top right, terracotta mid right, cream bottom right) and a faint paw-print pattern. These are decoration; they must never reduce text contrast.

**Type scale.** Page title 28/600 (Bricolage). Trip name in the summary card 26 (Bricolage). Summary numbers 24 and 17. Welcome headline 40/600 with -0.035em tracking. List row title 15/600, subtitle 12. Section label 10.5, uppercase, 0.1em tracking, 600. Buttons 15 to 16/600.

**Shape.** Cards 22 px radius, template tiles 20, trip icon tiles 14, buttons fully rounded, phone frame 34. Avatars are 34 px circles.

## Brand and logo

The logo is a dog face split orange and cream, with two people holding gold coins and a brown "Splitiful" wordmark whose first i has a paw as its dot. Three pieces are used, each in its own place.

| Piece | Where | Size | Light and dark |
| --- | --- | --- | --- |
| Wordmark | Home title on A and L | 112 x 31 px, left aligned | Brown #4a2d22 in light, cream #f5ecdc in dark |
| Wordmark | Welcome (T) | 150 x 42 px, left aligned | Same |
| Dog face | Welcome (T), inside a cream circle | 164 x 121 px dog, 244 px circle | Circle #fffaf1 in light, #f5ecdc in dark |
| Dog face | "No trips yet" card on L | 46 px wide inside a 64 px circle | Circle #f5ecdc in both |
| Dog face | App icon, splash, favicon | See below | Same tile in both themes |

**Welcome (board T).** A cream circle (244 px) bleeds off the top right corner with the dog inside it. A speech bubble reading "Divide by 6?" sits left of the circle, tilted about 3 degrees, with a small tail dot toward the dog. Below, left aligned: wordmark, headline, one short paragraph, then the buttons "Create your first trip" (56 px, primary), "I have an invite link" (52 px, glass), and the link "Already have a trip? Sign in". The two stat cards from the earlier Welcome are removed. The status bar text stays dark in both themes because the cream circle sits behind it.

**App icon, splash, favicon.** Dog face only, no wordmark, on a cream tile (#f5ecdc). Icon radius is about 23 percent of its size. Check it at 132, 60 and 40 px. Splash is the dog centered on the theme background with the warm glows; in dark mode place the dog on the cream circle. Favicon is the same dog on the cream tile at 16 and 32 px.

**Delivering the logo.** The artwork we hold is a 1254 px raster. The design uses transparent PNG cutouts of it, which show thin white edges on dark backgrounds (the white outline around each person and the white split line down the face are part of the original art). Ask design for the vector master (SVG) before the build, and use that for all pieces above. Do not stretch the wordmark; to narrow it, scale it down in proportion.

Miso, the earlier mascot photo, no longer appears in any screen on the canvas except the reference boards and the headline noted under open decisions.

## Screens

| Board | Behavior to build |
| --- | --- |
| T Welcome | First launch only. "Create your first trip" goes to Home on first run (L). "I have an invite link" opens the shared-link flow (J). "Already have a trip? Sign in" goes to Home. Terms and Privacy are not on this screen; they live in You (O). |
| A Home | Title is the wordmark. "Start from a template": Camping, Airbnb stay, International (item counts shown) plus a dashed "Blank trip" card. "Ongoing" and "Completed" lists follow, with counts in the section label. Ongoing rows show dates, people and items still to get (for example "Feb 14–17 · 6 people · 3 to get"); Completed rows show the month and "all settled" with a check badge. |
| L Home, first run | Same shelf, then one card: "No trips yet" with the dog and "Splitiful is ready when you are. Pick a template above, or start a blank trip." No Ongoing or Completed sections until a trip exists. |
| B New trip | Pick any number of types: Camping, Airbnb stay, International, and "Other". Which items a combination produces is not specified on the canvas; confirm with product. |
| C and trip screens | Top of the scroll: summary card (trip name 26 px with dates beneath, Settle up and Invite icon links on the right, avatars and "N people", Total so far and Avg / person, "You've paid" and "You'd owe" or "You're owed"). It scrolls away; nothing sticks. Then the list, with suggestions merged at the bottom under "Suggested for this trip" as chips and an "Add all" action. |
| D, E, F Empty list | Title "Nothing on the list yet", subtitle "Add items one by one, or start from a template." Copy from a past trip adapts: with 0 past trips the option is absent, with 1 it names that trip, with 2 or more it lists them all. |
| G | One tap on copy adds the items and shows a toast with Undo. |
| H Share | Share the list by link from the trip. |
| J, K Receive | Opening a shared link shows the list, then lets the person add it to a new trip or an existing one (K). |
| I Add all | Tapping "Add all" folds all suggestions into the list at once; the chips disappear. |
| M, N Long list | Header block scrolls with the page. After the first items, "+2 more" expands the rest. Suggestions always come last. |
| O You | Account, plus Privacy and Terms as rows. |
| Invite | Invite link card, add by email or phone, and a People list with count. "Share invite link" is the primary action. |

Inside a trip the bottom bar is Trips, Expenses, Details and List. Only the List screens are drawn on the canvas, so the Expenses and Details layouts are not specified here.

## Spacing and navigation

Spacing is one scale. Use these values and nothing in between.

| Where | Value |
| --- | --- |
| Page side padding | 16 px |
| Gap under the summary card | 28 px |
| Gap above a page title | 32 px |
| Gap between sections | 36 px (56 px above "Suggested for this trip") |
| Section label to its content | 14 px |
| Page title to subtitle | 8 px |
| List row vertical padding | 17 px |
| Trip screens scroll area | 44 px top, 176 px bottom, so nothing hides behind the bar |

The sheet screens (Share, Receive, Add to trip) keep their own tighter spacing and are not on this scale.

**Bottom bar.** On Home and You the tabs are Trips, New trip and You. Inside a trip they are Trips, Expenses, Details and List. Icons are 24 px; the label is 11 px. The active tab has a heavier icon (stroke 2.5 against 2), a bold label in the accent text color, and a 56 px by 3 px accent line centered on the top edge of the bar (top -9 px, rounded at the bottom corners). Bar padding is 8 px top and 20 px bottom, each tab 52 px tall. The bar is translucent with a 16 px blur and a hairline top border.

**Orientation.** Screens deeper than a tab root, such as Settle up, show a back link at the top.

## Settle up, trip complete, invite

A trip is Ongoing until the organizer locks it. Balances reaching zero does not complete a trip.

**Settle up (SettleUp).** Reached from the Settle up icon in the summary card. A back link, then a header card (trip, dates, people, total). A tinted status card says "Still on the trip." The list "Provisional · as of now" shows the suggested payments (for example Dev to You $64.20, Maya to You $90.40, You to Sam $26.20), then "Everyone's balance". These payments are provisional and recomputed as expenses change. The fixed bottom action "Trip complete" is shown to the organizer only, with the caption "You're the organizer. Only you can lock the trip." What other people see is not drawn; confirm with product.

**Trip complete (TripComplete).** Locking the trip moves it to Completed on Home. The screen shows an accent hero with a "Locked" pill and the final tally ("3 payments and you're even."), then a Payments list where each payment is marked paid as it lands (the canvas shows 2 of 3 paid), and a footer with how many are left. Whether expenses are frozen after the lock is not drawn; confirm with product.

**Invite (Invite).** Reached from the Invite icon in the summary card. People can join by link, email or phone. The list shows everyone on the trip with a count in its label.

**Who can do what.** Only the organizer locks the trip. Other permissions (who adds items, who edits expenses, what a non-member sees on a shared link) are not specified on the canvas and need a product decision before build.

## Open decisions and acceptance

Decide these before or during the build. Until answered, build what the canvas shows.

1. **Welcome headline.** Board T currently reads "You have fun. Miso does the math." The logo has no Miso. Choose "Miso does the math" (keep the character name) or "We do the math".
2. **Vector logo.** Provide an SVG master of the dog and wordmark. The PNG cutouts are a stopgap.
3. **Combining trip types.** B allows picking several types; the rule for which starter items result is not drawn.
4. **Permissions.** Who can add items, edit expenses or view a shared link beyond the organizer lock.
5. **Expenses and Details tabs.** Only the List screens are designed.
6. **Home on first run (L) header.** It shows the wordmark only, like A. The dog mark beside the title was explored and not adopted.

**Acceptance checklist**

- [ ] Every board in the Source of truth table marked Final matches the canvas in light and dark, using tokens, not raw colors
- [ ] Spacing matches the scale; no screen has a value outside it
- [ ] Bottom bar: 56 px accent line on the active tab, heavier icon and bold label, correct tabs on Home, You and inside a trip
- [ ] Trip summary card scrolls with the page and shows name, dates, people, totals and what you paid
- [ ] A trip becomes Completed only after the organizer locks it at Settle up
- [ ] Home groups Ongoing and Completed with counts; first run shows only the "No trips yet" card
- [ ] Welcome matches board T, including the bubble and the cream circle in dark mode
- [ ] Wordmark appears at 112 px on Home and 150 px on Welcome, brown in light and cream in dark, never stretched
- [ ] App icon, splash and favicon use the dog face only
- [ ] Text contrast stays readable over the background glows in both themes
- [ ] Reference boards (P, Q, Q2, S, S2, D2) are not built
