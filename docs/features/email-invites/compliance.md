# Email invites (mailto version): compliance review

Final state, 2026-10-12. Not legal advice; counsel sign-off is pending and does not block ship.

## Verdict: PASS

## What was verified in code

- The invitee's address never reaches Splitiful. In `src/app/trip/[id]/invite/page.tsx` the address lives only in React state, is passed to `buildInviteMailto` and assigned to `window.location.href`, then cleared. There is no `fetch`, storage call or logging, and no server call of any kind from Invite. `trackEvent("member_email_invite_open")` sends the event name only (listed in `docs/ANALYTICS.md`).
- A `mailto:` navigation is handled by the device and never hits Splitiful's servers or logs.
- Invite adds no roster row and stores no name, so there is no new personal data of any kind, no processor involvement (Resend sends nothing for it) and no retention rule to define.
- The message contains the trip's existing shared join link, a bearer secret the organizer already shares today. No new credential is created.

## Policy, Terms and runbook (applied by the docs stage)

- **Privacy policy:** the "names of other people" bullet states that the Invite by email address is used only in the browser to open the user's own mail app, is not received or stored, and nothing else typed there reaches us. The display-name wording was corrected for migration 0020 (one name per account, shown on every trip, changes apply to past trips). `LEGAL_LAST_UPDATED` is bumped.
- **Terms:** an invite clause says the user sends the message from their own account, should only invite people they know who would expect it, must not send spam or bulk messages, is responsible for what they send, and that Splitiful does not send it or keep the address.
- **Runbook:** the export query and deletion case B now cover `feedback` rows (free text linked to the account, no trip id); case C covers a person who exists only as a placeholder name, and says Invite by email adds no placeholder or other record.
- These claims hold only while nothing sends the address anywhere. Adding logging, analytics properties or a server call for it would make the policy sentence false. The card test asserts no server call is made.

## Remaining points

- **Anti-spam law (counsel):** Splitiful sends nothing and the user sends one message at a time, from their own address, with fixed copy and no footer. Whether a product-provided prefilled invite is the user's personal message (CAN-SPAM, CASL, PECR, EU "tell-a-friend" case law) is a legal question counsel should confirm; the Terms clause is the mitigation. The risk is much lower than for the abandoned server-sent design. If the message were ever deemed commercial from Splitiful, it would lack a postal address and opt-out.
- **One display name per account (counsel):** a name shown across all trips and rewritten on past, locked trips (0020). The money record is untouched; only labels change, and the old name is not retained. Advisory product follow-up: show the name that will be used before someone joins a new trip, with a "change" action.
- **Erasure for a person who exists only as an organizer-typed placeholder** (no account), and whether feedback free text is kept after erasure (recommendation: delete).
- Feedback is no longer tied to a trip; the policy ("linked to your account") stays accurate.
- The AvatarStack cap, Details "show all" and the `/feedback` redirect have no data or policy impact.

## Items for counsel (pending, not blocking)

1. The anti-spam position on a prefilled invite opened in the user's own mail app, and whether the Terms wording is enough.
2. The account-wide display name and its rewrite on past trips.
3. Erasure for a placeholder-only person with no account.
4. Retention of feedback free text after erasure.
