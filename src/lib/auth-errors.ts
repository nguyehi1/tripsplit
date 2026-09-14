import type { AuthError } from "@supabase/supabase-js";

/** Supabase's own message is a raw HTTP-rate-limit string — not something to show a user. */
export function friendlyAuthError(error: AuthError): string {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "You've hit our beta sign-in limit for now — check back in an hour when it resets.";
  }
  if (error.code === "otp_expired") {
    return "That code is wrong or has expired — check your email, or resend a new one.";
  }
  return error.message;
}
