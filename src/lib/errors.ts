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

export type ExpenseActionErrorCode =
  | "not_allowed"
  | "undo_unavailable"
  | "rate_limited"
  | "unavailable"
  | "unknown";

/**
 * What `deleteExpense` / `undoDeleteExpense` throw. The `message` IS the code: the original
 * database error (message, details, hint) is dropped and never logged, so nothing from the row can
 * reach the UI or analytics. The functions deliberately use one SQLSTATE per action (EX001 for
 * delete, EX002 for Undo) so the client cannot tell the failure causes apart; do not try to.
 */
export class ExpenseActionError extends Error {
  readonly code: ExpenseActionErrorCode;
  constructor(code: ExpenseActionErrorCode) {
    super(code);
    this.name = "ExpenseActionError";
    this.code = code;
  }
}

/**
 * Pure mapper from a caught Supabase error to a code. The only message it inspects is the
 * throttle's fixed `rate limited: ...` prefix. PGRST202 / 42883 (function missing, e.g. new code
 * on the old schema) maps to "unavailable" and never to a direct-delete fallback.
 */
export function expenseActionErrorCode(e: unknown): ExpenseActionErrorCode {
  const code = errorCode(e);
  if (code === "EX001") return "not_allowed";
  if (code === "EX002") return "undo_unavailable";
  if (code === "PGRST202" || code === "42883") return "unavailable";
  if (errorMessage(e).startsWith("rate limited")) return "rate_limited";
  return "unknown";
}

/** The single neutral line shown in the edit sheet for any failed delete (design.md 2.3). */
export const EXPENSE_DELETE_ERROR_COPY = "Couldn't delete that expense. Please try again.";

/** A delete has exactly one line for every code, on purpose: the causes cannot be told apart. */
export function expenseDeleteErrorCopy(): string {
  return EXPENSE_DELETE_ERROR_COPY;
}

/** Fixed Undo-toast lines per code (design.md 3.4). */
export function expenseUndoErrorCopy(code: ExpenseActionErrorCode): string {
  switch (code) {
    case "not_allowed":
    case "undo_unavailable":
      return "Couldn't undo — it's too late, or the trip was locked.";
    case "unavailable":
      return "Undo isn't available right now.";
    default:
      return "Couldn't undo — check your connection and try again.";
  }
}
