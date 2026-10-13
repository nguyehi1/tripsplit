# Email invites: planning

Date: 2026-10-08
> Historical proposal (2026-10-08). The shipped scope is in [requirements.md](requirements.md), which wins on any difference.

Stage: planning. This doc proposes a direction only. After the user picks one, the `pm` agent writes the requirements.

## Raw idea (user, verbatim)

> "allow organizer to add people using their emails. Once their email is added, they will receive a notification to join the trip. Once they click on the link, they are automatically added. but there should be a way to prompt and ask for their name if it's their first time."

## Vision check

`docs/v2-vision.md` never weighed this idea. It neither accepted nor rejected it. The feature doesn't make either core moment faster or clearer (logging an expense, seeing the final split). Its best argument is that it gets people onto the trip, which happens before both moments. Under the vision's sequencing, it comes after two things:
- the open security and compliance items: live service-role verification for `get_trip_by_invite_code`, the unthrottled `get_trip_summary`, and counsel sign-off on the privacy policy;
- expense delete.

The "ask for a name the first time" part is already handled by uncommitted migration `0020_one_display_name_per_account.sql`:
- `get_my_display_name` and `set_my_display_name` exist.
- `/check-email` and `JoinTripInline` only ask for a name when the account has none.

No new mechanism is needed for this part.

The remove-member-access planning (`docs/features/remove-member-access/planning.md`) is a precedent. It declined member-to-member email because "no existing pattern lets one member trigger email to another member's address without new scope." This feature is that new scope.

## How joining works today

- The organizer shares one link per trip (`/join/[code]`) through any channel.
- The invitee confirms with email and an OTP code. That upgrades their anonymous session in place (ADR 0006).
- They join through `join_trip` or `join_trip_by_id`, which are throttled per `auth.uid()` (migrations 0013 and 0016).
- Placeholder members (0008) are name-only and were deliberately built with no auto-merge.
- The only outbound email is "you created a trip", sent to the organizer's own address (`src/lib/email.ts`).

## PM's initial take (round 1)

The PM proposed real invite emails sent by Splitiful:
- **Who and how.** Only verified organizers can invite, one email at a time. The organizer sees "Pending" rows they can cancel. The shared link stays.
- **The email.** One plain message. The trip and organizer names are escaped. There is no free-text message, and the trip name stays out of the subject line.
- **Split auth.**
  - A brand-new email (no account yet) would be signed in by a single-use server token that lasts about 14 days.
  - An existing account never signs in from the link. It goes to the OTP step with the email prefilled.
  - Joining happens on an explicit "Join" button. Just loading the page does nothing, so mail scanners can't use up the token.
- **Anti-abuse.**
  - Database-backed rate limits: 10 per trip per day and 20 per account per day.
  - No re-sending to the same address for the same trip within 24 hours.
  - A global "don't send me invites" block list.
  - A footer that meets CAN-SPAM rules.
  - Possibly a separate sending subdomain, so invite complaints can't hurt delivery of the OTP emails.
- **Privacy.**
  - A new privacy-policy section covering emails that other people give us.
  - Resend's listed role gets wider.
  - Invite emails are deleted on expiry, cancellation or acceptance. This goes into the retention section and the runbook.
- **Placeholders.** Kept separate in v1. Letting an email attach to a placeholder would be a fast follow, since it reverses an earlier decision.
- **Removed members.** Removing someone cancels their pending invite. The copy in the removal confirmation needs an update.
- **Out of scope:** bulk import, invites from non-organizers, reminders, SMS, in-app notifications.

## Product-strategist's recommendation (round 1)

**Don't build it as asked. Build a narrower version.**

- **Low user impact.** Friend groups already have a group chat, and pasting one link is less work than typing N emails. The real new value is seeing who hasn't joined. That comes from linking an invite to a person, not from sending email.
- **Risks.**
  1. Auto-add on click makes the email a bearer credential, which reopens the class of risk the recent hardening work just closed.
  2. Any organizer could use Splitiful as a relay to send mail to any address. The organizer-controlled trip name is a phishing vector. If the shared sender's reputation suffers, OTP sign-in breaks for everyone.
  3. The privacy policy says email is collected "only if you choose to confirm one." Collecting addresses that other people type in needs a legal basis, retention rules and counsel review, and counsel hasn't signed off on the current policy yet.
- **Alternatives, cheapest first:**
  - (a) Better sharing of the link: native share sheet, copy, QR code.
  - (b) A `mailto:` invite sent from the organizer's own mail app.
  - (c) Pre-bind an email to a roster row.
  - (d) A nudge email sent by Splitiful that still requires OTP.

## Rebuttal round (round 2): where they converged

**The PM conceded the central auth point.** The no-OTP path for brand-new emails is withdrawn. The forwarded-email problem was worse than the PM first claimed:
- Whoever receives a forwarded invite permanently holds the account for someone else's address.
- Every later invite to that address then lands on their account.

The strategist made a related point. A 14-day link proves possession of the link, not control of the inbox. An OTP is short-lived and nobody forwards it by accident. Both agents now agree: **if any email is ever sent, the link only prefills the email (and can auto-send the code). The OTP step stays for everyone.**

**Other points of agreement:**
- (a) better sharing plus (b) `mailto:` are worth shipping now. They store no third-party email, send nothing from Splitiful, and need no policy change.
- The PM says this should be described honestly to the user: it is a sharing improvement, not the feature they described.
- The PM also notes `mailto:` depends on the organizer having a mail app configured, which is often missing on mobile web.
- The feature stays behind expense delete and the open security re-verifications.
- Existing accounts never sign in from a link.
- The "Join" button pattern stays, so mail scanners can't consume anything.
- The name prompt reuses 0020.
- Only organizers can invite.
- No free-text message in the email.

**The 0020 "Organizer" sentinel.** Confirmed out of scope for this feature:
- `JoinTripInline` and `/check-email` (`finishJoin`) both resolve a name before calling `/api/join`.
- Only `trip/new` sends a blank name, so only the organizer gets the sentinel, which was the intent.
- It would only become a bug if a new path inserted the member row before asking for a name. Dropping auto-join removes that path.

**If the user does want Splitiful to send email, the strategist accepts the PM's anti-abuse design plus these additions:**
- a per-recipient cap across all trips and organizers;
- verified organizers only, ideally with a minimum account age;
- bounce and complaint webhooks that auto-suppress the address;
- the trip name treated as untrusted text: plain text only, no URLs allowed in names;
- a "report this" link in the email;
- a global kill switch;
- SPF, DKIM and DMARC set up on a separate sending subdomain;
- a purge rule for invites that are never accepted;
- the privacy-policy update, reviewed by counsel, before launch.

## Remaining differences

- **What to build next among the deferred options.**
  - The PM wants (c) as an email attached to an existing placeholder. This covers the common "Dad is a placeholder, now I have his email" case, but reverses the "no auto-merge" decision.
  - The strategist wants a "Pending" row separate from placeholders: the organizer enters an email, the row is created, `mailto:` opens, and the row flips to "Joined" when someone verifies with that email. This avoids reversing the placeholder decision.
  - Both versions store third-party email, so both need the policy update.
  - With the strategist's version, the app can't know whether the mail was actually sent.
- **Whether the user's literal ask is achievable.** Both agents agree that "click and you're automatically added, no code" can't be done safely. That needs to be said to the user plainly, not discovered from what ships.

## Recommended direction (facilitator)

Build in stages:

1. **Now (low risk, no new data or policy):** native share sheet, copy and QR for the existing link, plus a prefilled `mailto:` invite. This is a sharing improvement, not auto-join.
2. **If "who hasn't joined" matters:** the organizer can attach an email to a roster row, either pending or placeholder (user decides which). The row converts when that email verifies through the normal OTP flow. Splitiful sends no mail. This requires the privacy-policy update.
3. **Only if (1) and (2) prove insufficient:** invite emails sent by Splitiful, using the combined anti-abuse list above. The link prefills the email and the OTP step is still required. There is no path where a click alone signs someone in.

## Open questions for the user

1. **Is "click, then you're in, with no code" a hard requirement?** Both agents conclude it can't be done safely, because a forwarded or scanned link could permanently take over someone's identity. The recommended fallback is "click, your email is prefilled and the code is sent, enter the code, you're in." Is that acceptable?
2. **What need is behind this?** For example: no group chat, wanting to see who hasn't joined yet, or too many taps to join. The answer decides whether stage 1 is enough or stage 2 is needed.
3. **Should Splitiful itself ever send email to people who aren't users,** or is the organizer's own mail app (`mailto:`) enough? Sending means taking on rate limits, unsubscribe and bounce handling, a separate sending domain, and risk to OTP deliverability.
4. **Is it acceptable to store emails of people who haven't signed up** and update the privacy policy, while counsel sign-off on the current policy is still pending?
5. **Placeholders vs. a separate "Pending" row.** Should an email attach to an existing placeholder, which reverses "no auto-merge"? Or should it create a separate pending row? And should pending invitees count in the split before they join?
6. **Priority.** Should this stay behind expense delete and the open security re-verifications, as the vision orders it, or jump ahead?
