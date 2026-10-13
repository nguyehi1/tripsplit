# Email invites (mailto version): QA report

Final state, 2026-10-12. Spec: [requirements.md](requirements.md). The earlier rounds covered the abandoned Splitiful-sent design and no longer apply.

## Verdict: PASS

| Check | Result |
|---|---|
| `npx tsc --noEmit` (ignoring `.next/`) | 0 errors outside `.next/` |
| `npx eslint src supabase` | 0 errors; 1 old warning (`src/lib/supabase/service.test.ts` unused `_args`) |
| `npx vitest run` | all pass. `src/lib/rate-limit.test.ts` (the Upstash sliding-window test) has failed once in a full run and passed on rerun; it looks timing-dependent and is not touched by this feature. |
| Migrations 0001-0020 on a real PostgreSQL 17.10 | applied cleanly in order; the four 0020 behaviours were exercised with real rows (below) |

## Acceptance criteria

1. Action visible only to the organizer of an open trip: PASS (`isOrganizer && !locked`; tests cover non-organizer and completed trip).
2. Email only; Tapping Invite opens the mail app with the exact copy: PASS. Subject `Sam invited you to Lisbon on Splitiful`, body `Hi there,` plus the shared join link and the organizer's name, byte-exact. The query holds only `subject` and `body`.
3. The address never reaches the server or storage: PASS. `handleInvite` is synchronous and makes no data call, no `fetch` and no logging. `trackEvent("member_email_invite_open")` carries the event name only.
4. Invalid address rejected inline: PASS ("That doesn't look like an email address."), with the error cleared on edit.
5. Organizer name in subject and signature: PASS. Greeting is always "Hi there,".
6. The `Organizer` stand-in name prompts for a real name first (`NamePromptForm`): PASS.
7. Encoding and control characters: PASS (matrix below).
8. No roster row, nothing added to the split; hidden on a completed trip: PASS.
9. No on-card notes: PASS (removed by the user's follow-up).
10. Join flow unchanged: PASS. No diff under `src/app/api/` or `src/app/join/`; the join, `JoinTripInline`, `check-email` and `verify-inline` tests pass.
11. No URL-name check: PASS.

Opening is immediate: the click handler assigns `window.location.href` in the same tick with no awaits, which keeps the user gesture intact on iOS Safari and Android Chrome. A desktop or webview with no mail handler does nothing visible; this is accepted.

## Mailto builder: injection and encoding matrix

- Addresses rejected by `isPlausibleEmail` (and `buildInviteMailto` throws): `x<y@z.com>`, `<a@b.com>`, `a@b.com,c@d.com`, `a@b.com;c@d.com`, an address followed by `%0d%0aBcc:`, a literal CRLF plus `Bcc:`, a space in the local part, a quoted local part, no TLD, `?cc=` or `&bcc=` suffixes, unicode local part or domain, a 65-character local part, an address over 254 characters. Plain, plus-tag and subdomain addresses are accepted (trimmed).
- Trip and organizer names containing CR, LF, U+2028, U+0085, NUL, DEL, tabs or `&to=`: control characters become a space. The URL has no raw whitespace, exactly one `?`, and only the keys `subject` and `body`. The body has only the template's own CRLFs. A literal `%0d%0a` typed in a name is encoded, not decoded into a break. Unicode and emoji round-trip.
- Length cap: the URL is held to 1800 characters by shortening only the organizer and trip names, by code point (never splitting an emoji). A lone surrogate already in a name is replaced so `encodeURIComponent` cannot throw. Tests cover emoji-heavy long names and a 5000-character trip name.

## Migration 0020 (one display name per account)

SQL review: correct. `canonical_display_name` ignores placeholders and the `'Organizer'` stand-in and is not executable by clients. `get_my_display_name` is authenticated-only. `set_my_display_name` rejects anonymous callers, enforces 1-50 characters after trimming and updates only the caller's non-placeholder rows. The BEFORE INSERT trigger skips placeholders, applies the canonical name, or falls back to `'Organizer'` on a blank name; `join_trip`'s upsert picks up the trigger's value, so a rejoin keeps the canonical name.

Exercised on PG 17.10 with real rows: no name before a trip and still none after `create_trip('T1','')` (stored as `'Organizer'`); `set_my_display_name('  Alex  ')` renamed all of the caller's trips (trimmed) and left a placeholder and other users untouched; the trigger let an existing name win on `create_trip` and join, and kept it on rejoin; anonymous callers and blank or 51-character names were refused; `anon` was denied on all three functions. There is no down-migration (none needed: never applied before this change).

## Kept work: regression

The `/feedback` page, its session gate in `proxy.ts` and the `/trip/:id/feedback` redirect; the AvatarStack cap and Details "show all"; the trip-card layout and Locked label; trip creation without a name; `check-email`, the name prompt, `JoinTripInline` and `verify-inline`; `errors.ts`, `rosterErrorCopy` and the raw-database-error tests; `isDbRateLimitError` (a bare thrown string is still a non-match, as pinned); placeholder add/rename/remove and remove/leave on the roster. All covered by tests and code reading.

## Cleanup completeness

Searches over `src`, `supabase`, `next.config.ts`, `.env.local.example`, `docs/ARCHITECTURE.md`, `docs/runbooks` and `package.json` for the removed design (`trip_invites`, `is_pending`, `inviteToken`, `sendTripInviteEmail`, suppression, webhook, unsubscribe, `/invite/[token]`, 0021, the invite env vars, `looks_like_url`, `name_is_provisional`) find no live code. The removed analytics scrubber files are gone and `src/app/layout.tsx` renders the plain `<Analytics />`.

## Open items

- The two " 2" duplicate files (`src/lib/locked-trip-copy 2.ts`, `docs/ux-consistency-review-2026-09-30 2.md`) are byte-identical copies still in the tree. The user has not approved deleting them.
- A user who deliberately names themselves "Organizer" is treated as unnamed and re-prompted forever (advisory; display-only, no authority attached). A joiner who submits a blank name is stored as `'Organizer'` by the trigger; the UI always shows the name prompt first.

## Tests

`src/lib/mailto-invite.test.ts` and `src/lib/mailto-invite.adversarial.qa.test.ts` (builder, copy, injection, encoding, length cap, surrogate pairs); `src/app/trip/[id]/invite/page.invite-by-email.qa.test.tsx` (the card: visibility, sentinel prompt, validation, synchronous open with the exact mailto, Enter, no server call); `supabase/migrations/0020_one_display_name_per_account.qa.test.ts` (static); `src/app/trip/[id]/verify-inline.needs-name.qa.test.tsx`, `trip-tabs.details-show-all.qa.test.tsx` and `add-expense-sheet-content.raw-db-error.qa.test.tsx` for the kept work.
