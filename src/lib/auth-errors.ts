import type { AuthError } from "@supabase/supabase-js";

/** Supabase's own message is a raw HTTP-rate-limit string — not something to show a user. */
export function friendlyAuthError(error: AuthError): string {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "We're sending sign-in links too fast right now — wait a few minutes and try again.";
  }
  return error.message;
}
