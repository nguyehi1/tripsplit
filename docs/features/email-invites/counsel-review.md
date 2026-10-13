# Splitiful: legal review request (October 12, 2026)

Prepared for: counsel reviewing the Privacy Policy and Terms of Use before release 0.7.0.

Splitiful is a small web app that splits shared trip expenses among a group. Contact address on the
policy pages: Splitiful@gmail.com. Minimum age 13. Users sign in with an email and a one-time code.
Anonymous accounts are deleted after 90 days of inactivity. Privacy requests are answered within
30 days. Payments are not processed; the app only calculates who owes whom.

This round changes three things. Counsel's earlier review items on the 2026-10-01 policy (retention,
deletion of the soft-deleted "Former member") remain open and are not repeated here.

## 1. What changed

### A. "Invite by email" (new feature)

The trip organizer types a person's email address and taps Invite. The organizer's own mail app opens
with a prefilled message. The organizer sends it from their own account.

- Splitiful sends no email, receives no copy and does not store the address. The address is used
  only in the organizer's browser to build a `mailto:` link, then cleared. No server request is made.
  There is no roster entry or other record.
- Message sent by the organizer (fixed text; no footer, unsubscribe or postal address because
  Splitiful is not the sender):

  > Subject: {Organizer name} invited you to {Trip name} on Splitiful
  >
  > Hi there,
  >
  > I'm using Splitiful to split costs for {Trip name}. Join here:
  > {link to the trip's join page}
  >
  > {Organizer name}

- The link is the trip's existing shared join link, which the organizer can already copy and share.
  A person who follows it confirms their own email with a one-time code before joining.

### B. One display name per account

Previously a user typed a display name for each trip. Now each account has one display name, used
on every trip it belongs to. Changing it changes it on all of that account's trips, including
completed ones. Only the label changes. Amounts, who paid and the split are unaffected, and the
previous name is not retained. Other members see the name but never the email address.

### C. Feedback is account-linked, not trip-linked

The in-app feedback form (a rating and an optional free-text comment) is no longer attached to a
trip. It remains linked to the account.

## 2. Exact new wording

Privacy Policy, "What we collect":

> **Display name.** You have one display name per account, shown to the members of every trip you
> belong to. When you join or create a trip we use the name you already have; if you change it, it
> changes on all of your trips, including past ones. Your email is never shown to other members.

> **Names of other people** an organizer adds to a trip (for example someone without the app). Please
> only add people who are fine with that. If you use Invite by email, the address you type is used
> only in your browser to open your own mail app; we do not receive or store it, and nothing else you
> type there reaches us either.

> **Feedback** you submit, if any (a rating and an optional comment), linked to your account and not
> to any particular trip.

Terms of Use, "Your use" list:

> Invite by email opens a message in your own email app. You send it, from your own account, so only
> invite people you know who would expect to hear from you about the trip. Don't use it to send spam
> or bulk or unsolicited messages. You are responsible for the messages you send. Splitiful does not
> send the message and does not receive or keep the address.

"Last updated" is now October 12, 2026 (effective date unchanged).

Operations runbook (internal, `docs/runbooks/account-deletion-and-export.md`): the data-export query
now includes feedback rows; the soft-delete path now also deletes the account's feedback rows; and a
new case covers a person who exists only as a name an organizer typed.

## 3. Questions for counsel

1. **Anti-spam law for Invite by email.** Splitiful provides the prefilled text and link, but the
   user sends one message at a time from their own address. Is Splitiful a "sender" or one who
   "causes or permits" the message under CAN-SPAM, CASL, UK PECR or EU rules, including any
   tell-a-friend case law? Is the Terms clause enough, or should the product add wording near the
   button? (An earlier design had Splitiful sending the email itself, with a postal address and
   unsubscribe link. It was dropped to avoid exactly this exposure.)
2. **Account-wide display name.** Is the policy sentence enough for a name that is shown across all
   of a user's trips and rewritten on past, completed trips? Existing users who today have different
   names on different trips keep them until they next join a trip (which applies their most recent
   name) or rename themselves (which applies to all trips), so is a notice needed?
3. **Erasure for a person with no account.** An organizer may type someone's name as a name-only
   member. That person has no account to match. The runbook offers anonymizing the name to "Former
   member" (keeps the split) or deleting the row (changes the split). Does that meet erasure
   obligations?
4. **Feedback free text on erasure.** The runbook deletes it. Does counsel agree it should always be
   deleted, or may it be kept in anonymized form?
5. **Carried over from the 2026-10-01 policy:** whether anonymizing a leaving user to "Former
   member" while keeping their amounts on shared expenses meets erasure obligations.

## 4. Facts that hold only while the code stays as it is

The claim "we do not receive or store the address" is true because the Invite card makes no server
call, logs nothing and sends no analytics property containing the address (the only analytics event
is the name `member_email_invite_open`, with no payload). A test enforces the no-server-call part.
If a future change sends the address anywhere, the policy sentence becomes false and must be
revisited first.
