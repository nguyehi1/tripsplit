/**
 * The one way to read a message off a caught error. supabase-js (postgrest-js 2.116) returns RPC
 * and table errors as plain `{ code, details, hint, message }` objects — NOT `Error` instances —
 * and the data helpers re-throw them as-is (`if (error) throw error`). So `e instanceof Error`
 * is always false for a database error, which silently hid every raised message (email-invites
 * QA finding F1). Use this anywhere a caught value may be a Supabase error.
 *
 * Returns "" when there's no usable message, so callers can write `errorMessage(e) || fallback`.
 * Only objects carry a message: a bare thrown string isn't a Supabase/Error shape and is treated
 * as unknown (existing route/rate-limit tests pin that).
 */
export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** The Postgres/PostgREST error code on a caught Supabase error (e.g. "42501"), or "". */
export function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}
