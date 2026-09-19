# Architecture: Remember sign-in email

## Summary

Pure client-side, additive change to `src/app/page.tsx` (`SignInContent`).
No new tables, no new API routes, no RLS changes, no server involvement.
Searched the codebase (`localStorage` grep, `src/lib/**`) and there is no
existing "remember on this device" or client-storage helper anywhere in
Splitiful today — this is genuinely new ground, not a parallel
implementation of something that already exists.

## Design

### 1. New module: `src/lib/remembered-email.ts`

A tiny, framework-free helper, following the existing convention of
free-standing modules in `src/lib/` (e.g. `src/lib/currency.ts`,
`src/lib/auth-errors.ts`) rather than inlining storage logic in the page
component. Kept separate (not folded into `src/lib/data/trips.ts`, which is
explicitly scoped to Supabase trip/expense data access) because this has no
relationship to that module's concerns.

```ts
const KEY = "splitiful:last-signin-email";

export function getRememberedEmail(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setRememberedEmail(email: string): void {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    // storage unavailable/blocked (private browsing, quota, disabled) —
    // fail silently, per AC7.
  }
}

export function clearRememberedEmail(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op, same reasoning as above.
  }
}
```

Every call is wrapped in try/catch: `localStorage` access can throw
synchronously (not just return `null`) in Safari private browsing and when
storage is disabled by policy, so a bare `.getItem`/`.setItem` call would
surface an error to the user in exactly the environment AC7 says must
degrade silently.

Namespaced key (`splitiful:last-signin-email`) to avoid any collision with
other localStorage consumers that might be added later (analytics, feature
flags, etc.) sharing the same origin.

### 2. `src/app/page.tsx` changes

- Initialize `email` state from `getRememberedEmail()` instead of `""`.
  Since `SignInContent` is a client component and `window` isn't available
  during SSR, this must happen in `useState(() => getRememberedEmail())` or
  a `useEffect` that runs after mount — using the lazy-initializer form of
  `useState` is simplest and avoids a render flash from empty → filled.
  (This file is already client-only and wrapped in `Suspense`, consistent
  with existing `useSearchParams()` usage in the same component, so no new
  rendering pattern is introduced.)
- On successful `signInWithOtp` (the existing success branch that currently
  calls `router.push("/check-email?...")`), call
  `setRememberedEmail(email)` immediately before the redirect. This
  satisfies AC1 and AC4 (last-used email always wins, whether it's the
  first-ever entry or an edit/replacement of a previously remembered one).
  Storing only happens on confirmed success, not on every keystroke or
  failed attempt, so a typo'd address that never got a magic link sent
  doesn't overwrite a previously-good remembered value.
- Add a small "Not you? Clear" text affordance near the `Field`, visible
  only when there is a remembered value to clear (i.e. when `email` is
  non-empty and matches what's stored — simplest correct condition: show it
  whenever the field currently has a value, since clearing is harmless even
  if the user typed a fresh address that was never stored). Clicking it
  calls `clearRememberedEmail()` and resets the `email` state to `""`,
  satisfying AC5. This is a plain inline control (button styled as text),
  not a new shared component, since it's a single-usage affordance local to
  this screen — no `src/components/ui.tsx` change needed.
- Add `name="email"` and `autoComplete="email"` to the existing `Field`
  usage for AC9. `Field` already spreads arbitrary `InputHTMLAttributes`
  through to the underlying `<input>` (`src/components/ui.tsx`), so this is
  a prop addition only, no component change required.

### 3. No API/data-model impact

- No `supabase/migrations/` change — nothing is stored server-side.
- No `src/app/api/` route added or changed.
- No RLS policy touched.
- No dependency on auth state: the remembered value is just a string tied
  to the browser, independent of whether `signInWithOtp` ever succeeds
  again, and explicitly not cleared by sign-out (AC8), so nothing here
  interacts with Supabase session lifecycle.

## Impact analysis

This feature only adds a new module and edits one existing page component;
it does not modify or remove any existing shared function, API route, DB
column, or RLS policy, so there is no existing-consumer breakage to
analyze in the usual sense. Specifically:

- `src/lib/remembered-email.ts` is new — zero existing consumers.
- `src/app/page.tsx` (`SignInContent`) has exactly one "consumer": it's the
  root route rendered by Next.js itself. The change is additive (new local
  state initializer, one new function call in an existing success branch,
  one new small UI element, two new props on an existing `Field`) — the
  existing `sendLink`, error handling, and navigation logic are unchanged.
- `Field` in `src/components/ui.tsx` is used elsewhere (e.g. trip name
  entry, join-trip screens, add-expense forms) — no signature or behavior
  change is made to `Field` itself, only new prop *values* passed at one
  call site, so all other call sites are unaffected.
- Backward compatibility: since this ships as a single, non-versioned
  client-side change with no server/schema component, there is no
  partial-deploy hazard — Vercel deploys the whole bundle atomically from
  the client's perspective (a given page load runs one consistent build),
  and there's no migration to be "ahead of" or "behind" the code for.

No ADR is warranted: there's no framework/library choice, no data model
shape decision, and no API-versioning tradeoff here — `localStorage` is the
only reasonable mechanism for "remember something on this browser without a
server," per the requirements doc's own scope clarification, and the
try/catch-wrapped helper is a routine defensive-coding pattern rather than
an architectural decision with consequences worth recording for future
readers.

## Testing notes (for the engineer, not exhaustive)

- Unit-testable in isolation: `src/lib/remembered-email.ts` can get a
  `*.test.ts` alongside it (matching the existing convention of
  `src/lib/currency.ts` / no test vs. `src/lib/settlement.ts` /
  `settlement.test.ts` and `src/lib/validation/expense.ts` /
  `expense.test.ts` — this repo tests `src/lib/` modules that have
  non-trivial logic branches, which the try/catch fallback here qualifies
  as).
- Manually verify AC7 by simulating a throwing `localStorage` (e.g. via
  `Object.defineProperty(window, "localStorage", { get() { throw new
  Error() } })` in a test, or Safari private mode manually) and confirming
  the sign-in form still renders and submits normally.
