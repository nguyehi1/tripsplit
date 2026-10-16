# Security Report: UX Revamp

Reviewed against `docs/features/ux-revamp/requirements.md`, `architecture.md`,
`docs/adr/0007-css-custom-property-tokens-for-themeable-restyle.md`,
`docs/adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md`, and
the actual working-tree diff (`git diff HEAD`, plus the new untracked files
under `src/app/trip/[id]/@sheet/`, `layout.tsx`, `trip-sheet-chrome.tsx`,
`sheet-shell.tsx`, `add-expense-sheet-content.tsx`). QA's `qa-report.md`
(193/193 tests, all 16 ACs pass) was independently re-run
(`npx vitest run src/app/trip/[id] src/app/page.texture-scope.qa.test.tsx`
→ 46/46 passing) rather than taken on faith.

## Overall verdict: no blocking findings

This is a presentation-layer restyle plus a routing-mechanism change
(page → intercepted/parallel-route sheet) that does not touch
authentication, authorization, RLS, or the Supabase data-access layer. The
one place a real vulnerability class could have crept in — the "one entry
point gets the real check, the other silently skips it" refactor bug called
out in the task — was checked directly and is not present.

## Findings

### 1. Add-expense owner-gating — both entry points share one auth implementation (verified, not a finding — documenting the check performed)

Both routes render the exact same `AddExpenseSheetContent` component with no
divergence:

- `src/app/trip/[id]/@sheet/(.)add-expense/page.tsx:11-18` (intercepted
  route) → `<SheetShell tripId={id} animateEntrance><AddExpenseSheetContent tripId={id} /></SheetShell>`
- `src/app/trip/[id]/add-expense/page.tsx:16-22` (hard-nav fallback) →
  `renderTripDashboard(id, { sheet: <SheetShell tripId={id} animateEntrance={false}><AddExpenseSheetContent tripId={id} /></SheetShell> })`

`animateEntrance` is a purely cosmetic prop (`sheet-shell.tsx:36-50`,
controls only CSS `transform`/`opacity` timing) — it has no effect on the
auth-gate logic below it.

`add-expense-sheet-content.tsx:58-102` contains the entire owner-gate: it
queries `auth.getUser()`, `trip_members` count, and `trips.completed_at,
created_by`, then fail-closes exactly as before —
`const isOwner = tripResult.error || !tripResult.data ? true : user?.id === tripResult.data.created_by`
(line 81) treats an ambiguous/errored ownership query as "could be the
unverified owner" and redirects, both on a resolved postgrest error and on
an outright promise rejection (`.catch` at line 90-97). This is a diff
against the pre-refactor `add-expense/page.tsx` and is byte-for-byte
unchanged logic (confirmed via `git diff HEAD -- 'src/app/trip/[id]/add-expense/page.tsx'`
— the whole gate block was deleted from that file and appears verbatim in
the new shared component). Since there is exactly one implementation and
two callers, not two implementations, the "one path gets the check, one
doesn't" bug class does not apply here.

I also independently ran the rewritten
`add-expense/page.owner-gate.qa.test.tsx` (now targeting
`AddExpenseSheetContent` directly per ADR 0008's required rewrite) — it
still exercises: unverified-owner redirect-on-direct-hit, verified-owner
not redirected, unverified-invitee (non-owner) not redirected, and both
fail-closed branches (postgrest error, network rejection) for an unverified
session, plus the fail-open-is-fine case for an already-verified session
whose ownership query errors. All pass. This is a real behavioral
regression test, not a rubber stamp of the engineer's own claim.

**Rating: note (informational — confirms no vulnerability, not a code change requested).**

### 2. `trip-sheet-chrome.tsx`'s `dimmed` state is purely presentational (verified)

`src/app/trip/[id]/trip-sheet-chrome.tsx:6-8,22-29` derives `dimmed` from
`usePathname().endsWith("/add-expense")` and uses it only to set inline
`filter`/`transform`/`opacity` CSS on a decorative overlay div (lines
32-51). Nothing reads `dimmed` to decide whether to fetch data, render
sensitive content, or skip a check — it wraps `children`, which is already
fully rendered/fetched server-side by `renderTripDashboard` before this
client leaf ever runs. `layout.tsx:20` passes the real `children` through
unconditionally regardless of `dimmed`. No security-relevant logic is gated
on this client-derived value.

**Rating: note — confirmed safe, no action needed.**

### 3. Invite-code RPC-grant surface — not touched or exercised by this feature (verified)

Grepped the entire diff and all new files
(`@sheet/*`, `layout.tsx`, `trip-sheet-chrome.tsx`, `sheet-shell.tsx`,
`add-expense-sheet-content.tsx`, `home-screen.tsx`, `page.tsx`) for
`invite`/`join_trip`/`get_trip_by_invite_code` — the only match is
`extractInviteCode`/the `/join/[code]` push in `home-screen.tsx`, which
predates this feature (confirmed via `git diff HEAD -- src/app/home-screen.tsx`:
that code path is untouched; the diff there is limited to the Miso
art/copy/token swap in `WelcomeContent`). This feature adds no new
invite-code UI, route, or RPC call. The known, separately-tracked
`anon`/`authenticated` grant issue on `get_trip_by_invite_code`/`join_trip`
(`docs/ROADMAP.md`) is unaffected and correctly out of scope here, per
requirements.md's non-goals.

**Rating: note — confirmed no regression to a known, tracked issue.**

### 4. Supabase schema/RLS — confirmed unchanged (verified, not inferred)

`git diff HEAD -- supabase/migrations/0001_init.sql` shows exactly one line
changed: a comment rename (`TripSplit` → `Splitiful`), pre-existing and
unrelated to this feature:

```
-- TripSplit v1 schema: trips, membership, expenses, feedback.
+-- Splitiful v1 schema: trips, membership, expenses, feedback.
```

No new tables, columns, policies, or grants. `src/lib/data/trips.ts`,
`src/lib/auth-gate.ts`, `src/lib/validation/expense.ts` all show zero diff
(`git diff HEAD --stat -- src/lib/` shows only `src/lib/rate-limit.ts`,
a one-line Redis key-prefix rename `tripsplit:` → `splitiful:`, unrelated
to authorization). AC16's claim is correct.

**Rating: note — verified true, not just claimed.**

### 5. No secrets, no new dependencies, no injection surface introduced

- `package.json`/`package-lock.json` diff is empty — no new dependency was
  added, so there's nothing new to run `npm audit` against for this
  feature.
- No `NEXT_PUBLIC_`/`process.env` reference appears in any new file under
  `src/app/trip/[id]/` (`@sheet/*`, `layout.tsx`, `trip-sheet-chrome.tsx`,
  `sheet-shell.tsx`, `add-expense-sheet-content.tsx`) — grepped directly,
  zero matches.
- No `dangerouslySetInnerHTML`, `eval`, or string-built query appears
  anywhere in the diff. The one new `<img src="/images/miso-welcome.jpg">`
  (`src/app/home-screen.tsx`) is a static, build-time-known asset path, not
  user input.
- `SheetShell`'s close affordances and the sheet's own X buttons all use
  `<Link href={\`/trip/${tripId}\`}>`/`IconLinkButton` with `tripId` sourced
  from the route's own `params` (server-validated by whatever already
  resolves `/trip/[id]` — unchanged), not from any new client-supplied
  input.

**Rating: note.**

## Summary for the pipeline

No blocking or should-fix findings. The refactor genuinely relocated
(not rewrote) the add-expense owner-gate into a single shared component
consumed identically by both entry points, the new client-side pathname
check is decorative only, the feature doesn't touch or extend the
known invite-code grant issue, and the "no schema/RLS change" claim in
architecture.md and qa-report.md is independently confirmed against the
actual migration diff. This feature can proceed from a security standpoint.
