# Email invites (lighter version): requirements

Date: 2026-10-12 (final user rescope)
Status: shipped to `main`; counsel review of the Terms invite clause is still open (see the roadmap). This is the final spec. Where it differs from [planning.md](planning.md) (a dated proposal from the earlier, abandoned design), this doc wins.
Semver: **feature** (minor bump). Additive. Nothing that exists today changes for existing users.

> **History.** An earlier design had Splitiful send the invite email itself (per-person tokens, Pending rows with stored emails, a suppression list, a bounce webhook, an opt-out page, 30-day auto-removal). The user abandoned it on 2026-10-12 and none of it was built into the shipped version. [ADR 0014](../../adr/0014-email-invites-pending-member-rows-and-non-credential-tokens.md) records it and is marked superseded.

## Problem

Organizers want to bring specific people onto a trip without first collecting them in a group chat. The shared `/join/[code]` link already works, but sharing it means copying it by hand into a message. The organizer wants a one-tap "Invite by email" that writes the message for them, with the least possible burden on Splitiful: no email sending, no stored third-party addresses.

## What it is

On the roster, the organizer taps **Invite by email**, types an email address, and Splitiful opens the organizer's **own mail app** with a prefilled `mailto:` message. **Splitiful sends no email.** The link in the message is the trip's existing shared `/join/[code]` link.

## Decisions carried in (user-approved)

- The link is the existing shared `/join/[code]` link. It works until the trip is completed. It is not personal to the invitee. No per-person token, no sign-in-by-link, no new landing page.
- The join experience is the existing one and must keep working: a new invitee with no session enters email, 6-digit code, joins, then sees the name prompt only if the account has no name (migration 0020, `get_my_display_name`). A returning user already signed in on that browser gets the existing one-tap join.
- The first-time name prompt is kept.

## Email copy (final, do not change)

Subject: `{Organizer} invited you to {Trip name} on Splitiful`

Body:

```
Hi there,

I'm using Splitiful to split costs for {Trip name}. Join here:
{join link}

{Organizer}
```

No "Do not reply", no footer, no postal address, no explanation of the code.

## Follow-up 2026-10-12 (user feedback after the first build)

Supersedes the parts of the sections above that mention an optional name, a placeholder or on-card notes.
- **No name field.** The card is an email field and an Invite button. The greeting is always "Hi there,".
- **No placeholder and no roster row.** Tapping Invite adds nothing to the trip or the split; option (b)'s optional-name placeholder is gone. Nothing at all is stored or received by Splitiful.
- **No notes on the card.** The "Splitiful doesn't send anything" note, the "Only invite people who know you." cue and the "Your mail app should be open" confirmation with its "Open mail app" link were removed. The Terms of Service still carry the "invite people you know" language.
- **Opens immediately.** Tapping Invite (or Enter) validates the address, builds the `mailto:` and opens it in the same tick, with no awaits and no server call. The URL is capped at 1800 characters by shortening only the organizer and trip names (by code point).
- Unchanged: the organizer-name prompt first when the name is still the `Organizer` stand-in, inline invalid-email error, hidden on a completed trip and for non-organizers, URL-encoding and control-character stripping.

## Decision record: does tapping Invite create a roster row?

No. The user first chose option (b) (an optional typed name becomes an ordinary name-only placeholder, no email stored), then on 2026-10-12 removed the name field as well. Tapping Invite never adds a row or anything to the split. The alternative, a Pending row with a stored email converted on join, was rejected: it needs a stored third-party email, a retention rule, a privacy-policy change and conversion logic, and an abandoned mail draft would leave a phantom person in everyone's split. When the invitee joins, they appear as a new member through the unchanged join flow.

## Acceptance criteria

Organizer flow
1. On the roster of an open trip, the organizer sees an **Invite by email** action. Non-organizers do not see it.
2. It takes an email (required) only. Tapping Invite opens the organizer's mail app via a `mailto:` with the subject and body from "Email copy", prefilled. Nothing is sent by Splitiful.
3. The email address is never sent to the Splitiful server and never stored. It exists only in the browser to build the `mailto:` and `to:` field.
4. An invalid address is rejected inline with a clear message. No other email checks are made (no "already a member" or "own email" lookups, since the address is not stored or matched).
5. The body always greets "Hi there,". The organizer name in the subject and signature is the organizer's display name for this trip.
6. If the organizer's name is still the `Organizer` placeholder, they are asked for a real name first (existing `NamePromptForm`), because the subject and signature use it.
7. All values are URL-encoded in the `mailto:`. Line breaks and control characters in the trip name or organizer name are removed so they cannot add headers or recipients.
8. No roster row is created and nothing is added to the split. The invite action is blocked (hidden) on a completed (locked) trip.
9. The card carries no explanatory note or confirmation line (removed in the 2026-10-12 follow-up). The Terms of Service carry the "invite people you know" wording.

Join (no change; must keep working)
10. The link is the existing `/join/[code]` link. New invitee, no session: email, code, join, then the name prompt only if the account has none. Already signed in: existing one-tap join. The link stops working when the trip is completed, as today.

Name and the URL check
11. There is no "name looks like a web address" block. The message is plain text, written and sent by the organizer from their own account, so that check has no purpose here. Input hygiene in AC7 still applies.

## Non-goals

- Splitiful sending any email, tracking delivery, bounces, opt-outs, or a suppression list.
- Storing invitee emails; Pending rows; per-person tokens; a no-code or link-based sign-in; a new landing page.
- Auto-removal after 30 days (there is nothing stored to expire).
- Adding a placeholder or any roster row from Invite, or merging anyone with the person who joins.
- Changes to the shared link, the join flow, or the OTP flow.
- A free-text message, bulk invites, SMS.
- Analytics or privacy-policy changes for stored invites (none are stored).

## What was removed from the abandoned design

The tree never shipped with the Splitiful-sent version: migration 0021 and everything in it (invite tables, RPCs, pg_cron job), the invite API routes, the `/invite/[token]` and `/unsubscribe` pages, the Resend invite sender and webhook, their libraries, env vars and tests, and the `looks_like_url` check were all deleted. Migration 0020 (one display name per account) was kept in its simpler form, with the `'Organizer'` stand-in name and no provisional-name flag. Behaviour-neutral refactors made along the way stayed: `NamePromptForm`, `InlineOtpPanel`, `ConfirmInlineAction`, `DeadEndScreen`, `src/lib/errors.ts` and the `rosterErrorCopy` fixes. Unrelated work in the same tree is also unchanged: the `/feedback` page and its redirect, the AvatarStack cap and Details "show all", the trip-card layout, and no name at trip creation.
