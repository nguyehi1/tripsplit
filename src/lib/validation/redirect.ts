/**
 * Guards `router.push` calls fed by a `next`/`back` query param (`/check-email`,
 * `/join/[code]/welcome`) against an open redirect: a crafted link can set those params to an
 * absolute or protocol-relative URL, and the app would otherwise hand it straight to
 * `router.push` as a "trusted" post-verification destination. Only an internal, single-segment
 * path (starts with `/`, not `//` or `/\`, no embedded scheme) is allowed through; anything else
 * falls back to `fallback`. See docs/product/roadmap.md's invite-code-rpc-hardening entry, "should-fix"
 * item on `src/app/check-email/page.tsx`.
 */
export function sanitizeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("://")) return fallback;
  return value;
}
