# Email invites (mailto version): security review

Final state, 2026-10-12. Replaces the review of the abandoned server-sent design.

**Verdict: PASS.** No blocking findings.

## Findings

### S1 (fixed): name truncation could split an emoji and make `encodeURIComponent` throw
- `src/lib/mailto-invite.ts`, the length-cap shortening. When a long, emoji-heavy name pushed the URL past 1800 characters and the cut landed inside a surrogate pair, `encodeURIComponent` threw `URIError`. At the time the invite flow had already added a placeholder, so the mail app never opened and a retry added a duplicate.
- Fixed: truncation is by code point, lone surrogates are replaced before encoding, and the mailto is built before anything else happens. The invite flow now makes no server call at all, so a build failure cannot leave anything behind; any remaining error shows our own message. Tests: emoji-heavy long names and a pre-cut lone surrogate.

### S2 (note): bidi and zero-width characters are not stripped from names
`stripControlChars` covers C0, C1, U+2028 and U+2029, not U+200B-U+200F, U+202A-U+202E, U+2066-U+2069 or U+FEFF. The organizer's own name, the trip name and the address all come from the organizer, who sees the draft in their own mail app and sends it themselves, so they can only spoof themselves, and percent-encoding blocks header, recipient and body injection. Optional hardening only.

### S3 (note): `set_my_display_name` also renames the caller's rows on completed trips
Self-only (no user-id parameter, so no cross-account write) and intended by "one name per account". It changes labels inside settled history, not amounts or shares. The 1-50 length check applies; there is no control-character or bidi filtering, same as the existing join and placeholder RPCs.

### S4 (note): a user can choose the name "Organizer"
The stand-in only decides whether to prompt for a name again. Organizer rights come from `trips.created_by`, so the name carries no authority; it is a display-only look-alike, like any duplicate name.

### S5 (note, pre-existing): `add_placeholder_member` has no server-side length or control-character check on the name
Not part of this feature any more (Invite adds no placeholder), but worth a `char_length <= 50` check in a later migration.

### S6 (note, pre-existing): `/join/<code>` is recorded in Analytics page URLs
The join code is the real capability URL and is not scrubbed from Vercel Analytics. Noted for the `vercel-analytics` feature.

## Verified clean

- **mailto injection:**
  - The recipient must match a strict addr-spec, which rejects commas, semicolons, `<>`, quotes, whitespace and CR/LF, so no extra recipients.
  - The recipient goes through `encodeURIComponent` with only `@` restored, so `?`, `&` and `=` cannot add `cc`, `bcc` or `body` fields.
  - Subject and body are fully percent-encoded, and CR/LF in names is replaced with a space first.
  - The length cap shortens only the organizer and trip names; the address and link are never touched.
- **The card:** the address is used only for validation, the mailto and local state; there is no fetch, log or analytics property. The `href` is always the literal `mailto:` scheme (no `javascript:` vector), nothing uses `dangerouslySetInnerHTML`, and the action is hidden on locked trips and for non-organizers. Invite makes no server call, so there is no new endpoint or RPC to abuse.
- **Migration 0020:** all four functions are `security definer` with `set search_path = public`; the helper and trigger function have all grants revoked; the public ones are authenticated-only. `get_my_display_name` returns only the caller's own name; `set_my_display_name` rejects anonymous callers and has no user-id parameter. The trigger reads only that user's own earlier rows. No RLS policy or summary function changed. The migration is idempotent.
- **Feedback:** `/feedback` is behind the session gate in `proxy.ts`; the `/trip/:id/feedback` redirect has a fixed destination (no open redirect); `next` still goes through `sanitizeInternalPath`.
- **`errors.ts` and `rate-limit.ts`:** `isDbRateLimitError` now also matches plain Supabase error objects, which can only show the rate-limit response, never hide an auth failure. `rosterErrorCopy` shows our own text and never raw database text.
- **Removed design:** no invite tables, token columns, suppression or bounce tables, opt-out page, webhook route or new env vars remain in `src` or `supabase/migrations`; the only untracked migration is 0020.
