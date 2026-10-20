# Rendering

Pages that fetch data are Server Components. Interactivity lives in small client leaves. Add-expense and add-item open as route-backed sheets. This page covers those patterns plus design tokens and device-local state.

## Server Components by default

Data-fetch-then-render pages fetch through `src/lib/supabase/server.ts` during SSR, not in client components on mount. `src/app/trips/page.tsx` and `src/app/trip/[id]/page.tsx` follow this.

| Rule | Why |
|---|---|
| Put state that needs no server round trip (a tab switch) in a small co-located `"use client"` leaf fed by props | Keeps the page itself server-rendered |
| Express pure navigation as `<Link>`, `LinkButton` or `IconLinkButton` (`src/components/ui.tsx`), not `router.push` in an `onClick` | A function prop cannot cross the Server to Client boundary; an `href` string can |
| Page code under `/trip/*` does its own `getUser()` and RLS-backed fetch | `src/proxy.ts` does not gate those routes ([Auth](auth.md#the-proxy)) |
| Check trip membership in the page, by letting RLS surface an error and rendering the inline "couldn't load" UI | `proxy.ts` cannot make that check |

Form-heavy pages (`check-email`, `join/[code]`, the home page) need a case-by-case split rather than a wholesale conversion. See [ADR 0005](../adr/0005-ssr-page-conversion-pattern.md).

`src/app/trip/[id]/page.tsx` exports a shared render function, `renderTripDashboard`. The hard-navigation fallback for add-expense reuses it so there is one tiered fetch and render implementation.

## Sheets as routes

Add-expense and add-item render as overlay sheets over the trip view, and each is also a real URL.

| Piece | Role |
|---|---|
| `@sheet/(.)add-expense/page.tsx`, `@sheet/(.)add-item/page.tsx` | Intercept in-app, client-side navigation so the trip view underneath is never refetched or remounted |
| `add-expense/page.tsx`, `add-item/page.tsx` | The literal routes. They render the full dashboard with the sheet already open, for deep links, refreshes and hard navigation. |
| `@sheet/default.tsx`, `@sheet/page.tsx`, `@sheet/[...catchAll]/page.tsx` | Return `null` so the sheet never stays open after navigating elsewhere under `/trip/[id]/*` |
| `trip-sheet-chrome.tsx` (`"use client"`) | Reads `usePathname()` to decide whether the sheet is open, and dims, blurs and scales the trip view to match |

Because the dimmed state is derived from the pathname, a cold load renders already dimmed with no replayed entrance animation. Any new route that should dim the background must be added to the pathname check in `trip-sheet-chrome.tsx`.

Reserve this pattern for page-versus-overlay cases. Default to a plain Server Component plus `<Link>`. See [ADR 0008](../adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md).

### Mount-time fetch in the add-expense sheet

`add-expense-sheet-content.tsx` runs a client-side gating fetch on mount (member count, lock state, ownership), which repeats data the trip page already computed. Moving it to server props would change when the sheet opens and where the owner and lock gate runs, so it needs security review. It is tracked in the [roadmap](../product/roadmap.md).

## Design tokens and theming

All color, shadow and radius values are named CSS custom properties declared in `src/app/globals.css`'s `:root` block and mirrored into the adjacent `@theme inline` block for Tailwind utilities.

- Reference `var(--token)` or a token-backed utility class. Never use a raw hex, oklch or rgba literal for anything that should follow a theme.
- Extend the token set in `globals.css` rather than adding a local literal.
- One theme ("warm paper", light) ships. There is no `[data-theme]` block, toggle or `prefers-color-scheme` handling. The token names exist so a future dark theme is a value swap.
- Shared primitives in `src/components/ui.tsx` take new visual behavior as off-by-default props or variants, because many routes share them.
- `Screen` clips with `overflow: clip`, not `hidden`. `hidden` creates a scroll container and silently disables `position: sticky` on the top and bottom bars. Do not change it back.

See [ADR 0007](../adr/0007-css-custom-property-tokens-for-themeable-restyle.md). [ADR 0016](../adr/0016-system-preference-dark-theme-via-data-theme-attribute.md) is a withdrawn draft for the dark theme mechanism.

## Device-local state

Small, non-sensitive, per-device conveniences use `localStorage` (for example the remembered sign-in email in `src/lib/remembered-email.ts`). Use a namespaced key, and wrap every read and write in `try/catch` so the feature degrades to the default behavior when storage is blocked, such as in private browsing.

## Why

Server rendering removes a client-side auth and fetch waterfall that the proxy had already made redundant. Intercepted routes keep the trip view mounted under the sheet, which a query-param or client-state overlay could not do while staying linkable.

## Related

- [Auth](auth.md)
- [Code map](../reference/code-map.md)
- [ADR 0005](../adr/0005-ssr-page-conversion-pattern.md), [ADR 0007](../adr/0007-css-custom-property-tokens-for-themeable-restyle.md), [ADR 0008](../adr/0008-add-expense-sheet-via-intercepting-parallel-routes.md)

Last verified: 2026-10-20 against 9a951bb
