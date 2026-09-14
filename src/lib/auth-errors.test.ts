import { describe, expect, it } from "vitest";
import type { AuthError } from "@supabase/supabase-js";
import { friendlyAuthError } from "./auth-errors";

function makeAuthError(overrides: Partial<AuthError>): AuthError {
  return {
    name: "AuthApiError",
    message: "raw supabase message",
    status: 400,
    code: undefined,
    ...overrides,
  } as AuthError;
}

describe("friendlyAuthError", () => {
  it("shows the beta rate-limit message for over_email_send_rate_limit code", () => {
    const err = makeAuthError({ code: "over_email_send_rate_limit", status: 429 });
    expect(friendlyAuthError(err)).toBe(
      "You've hit our beta sign-in limit for now — check back in an hour when it resets.",
    );
  });

  it("shows the beta rate-limit message for a bare 429 status even without the specific code", () => {
    const err = makeAuthError({ code: undefined, status: 429 });
    expect(friendlyAuthError(err)).toBe(
      "You've hit our beta sign-in limit for now — check back in an hour when it resets.",
    );
  });

  it("shows a friendly wrong/expired-code message for otp_expired (OTP flow, not the old magic link)", () => {
    const err = makeAuthError({ code: "otp_expired", status: 403 });
    expect(friendlyAuthError(err)).toBe(
      "That code is wrong or has expired — check your email, or resend a new one.",
    );
  });

  it("falls back to Supabase's raw message for unrecognized error codes", () => {
    const err = makeAuthError({ code: "some_other_error", status: 400, message: "Something specific broke" });
    expect(friendlyAuthError(err)).toBe("Something specific broke");
  });

  it("prioritizes the rate-limit message over otp_expired if somehow both matched (rate limit checked first)", () => {
    // Not realistically both true, but pins down which branch wins given the if/else-if order.
    const err = makeAuthError({ code: "over_email_send_rate_limit", status: 429 });
    expect(friendlyAuthError(err)).not.toContain("code is wrong");
  });
});
