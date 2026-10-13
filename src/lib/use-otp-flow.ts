"use client";

import { useEffect, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "@/lib/remembered-email";
import { createClient } from "@/lib/supabase/client";

export const RESEND_COOLDOWN_SECONDS = 60;

export type OtpPhase = "email" | "code";

/** "0:59"-style resend countdown, shared by every OTP screen (was duplicated byte-for-byte). */
export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export type OtpFlow = ReturnType<typeof useOtpFlow>;

/**
 * Shared OTP send/confirm logic (docs/features/simplified-onboarding/architecture.md, "Shared
 * OTP logic: extract a hook, don't duplicate the linking fork"). This is the ONE place the
 * anonymous-to-permanent linking fork (Decision 4, ADR 0006) is implemented:
 *
 *   sendCode/resend -> isAnonymous ? updateUser({ email }) : signInWithOtp({ email })
 *   confirmCode     -> isAnonymous ? verifyOtp({ type: "email_change" }) : verifyOtp({ type: "email" })
 *
 * Both `src/app/check-email/page.tsx` (full-page — the invitee's unchanged attempt-then-redirect
 * flow, and the no-browser-memory returning-sign-in) and the trip page's inline organizer widget
 * (`src/app/trip/[id]/verify-inline.tsx`) call into this hook rather than each holding their own
 * copy of the branch — a bug found in it later only needs fixing in one place.
 *
 * `initialEmail`/`skipToCode` let a caller that already collected the email and sent the code
 * elsewhere (e.g. `/`'s plain sign-in) start straight on the code step instead of the email step.
 */
export function useOtpFlow(opts: { initialEmail?: string; skipToCode?: boolean } = {}) {
  const [phase, setPhase] = useState<OtpPhase>(opts.skipToCode ? "code" : "email");
  const [email, setEmail] = useState(opts.initialEmail ?? "");
  const [remembered, setRemembered] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [justResent, setJustResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  // True once `sendCode`/`resend` had to fall back from linking (an anonymous session trying to
  // upgrade in place) to a plain sign-in, because the email already belongs to an existing
  // permanent account (Supabase's `email_exists` on `updateUser`) — an anonymous session can't
  // be linked to an email someone else already owns. `confirmCode` needs this because the
  // session is *still* anonymous at verify time (the OTP hasn't been confirmed yet), so its own
  // `isAnonymous` check would otherwise re-pick the linking verify type and fail the same way.
  const [signingIntoExisting, setSigningIntoExisting] = useState(false);

  useEffect(() => {
    if (phase !== "code") return;
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [phase, secondsLeft]);

  /** Prefill from remembered-email.ts — call from a layout effect on mount, same as before. */
  function loadRememberedEmail(): string {
    const stored = getRememberedEmail();
    if (stored) {
      setEmail(stored);
      setRemembered(stored);
    }
    return stored;
  }

  function clearRemembered() {
    clearRememberedEmail();
    setRemembered("");
    setEmail("");
  }

  /**
   * The contextual trigger's own "send the code" step. Branches on session state per
   * architecture.md's "OTP confirmation: sign-in vs. linking" — an anonymous session (organizer
   * who already owns this trip, or an invitee who's about to be given one) is upgraded in place
   * via `updateUser`, never a fresh `signInWithOtp`, so the existing anonymous session's
   * `auth.uid()` (and any RLS ownership already tied to it) carries forward instead of silently
   * resolving to a different/new user. Returns whether the send succeeded.
   *
   * Live-verified gap closed: `updateUser({ email })` fails with `email_exists` when that email
   * already belongs to a different, existing permanent account — Supabase won't link an
   * anonymous session to someone else's identity. That's not a dead end, just the wrong branch:
   * this is actually a returning registered user with no local session (e.g. a private window,
   * or browser data cleared), so it falls back to a plain `signInWithOtp` for that email instead
   * of surfacing "already registered" as if it were an error.
   */
  async function sendCode(inputEmail: string): Promise<boolean> {
    if (!inputEmail.trim()) {
      setSendError("Enter your email first.");
      return false;
    }
    setSendError(null);
    setSending(true);
    try {
      const supabase = createClient();
      let {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // No session at all yet (first time hitting this trigger) — give them an anonymous
        // session now, so the branch below has one to upgrade in place. See architecture.md's
        // "Invitee join sequencing": join_trip itself still only runs after verifyOtp succeeds.
        const { error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
      const isAnonymous = user?.is_anonymous === true;
      let authError = isAnonymous
        ? (await supabase.auth.updateUser({ email: inputEmail.trim() })).error
        : (await supabase.auth.signInWithOtp({ email: inputEmail.trim() })).error;
      let fellBackToSignIn = false;
      if (isAnonymous && authError?.code === "email_exists") {
        authError = (await supabase.auth.signInWithOtp({ email: inputEmail.trim() })).error;
        fellBackToSignIn = true;
      }
      if (authError) {
        setSendError(friendlyAuthError(authError));
        return false;
      }
      setSigningIntoExisting(fellBackToSignIn);
      setEmail(inputEmail.trim());
      setRememberedEmail(inputEmail.trim());
      setRemembered(inputEmail.trim());
      setPhase("code");
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      return true;
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Couldn't send a sign-in code — try again.");
      return false;
    } finally {
      setSending(false);
    }
  }

  async function resend(): Promise<boolean> {
    if (secondsLeft > 0) return false;
    setResendError(null);
    setVerifyError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const isAnonymous = user?.is_anonymous === true;
      let error = (
        isAnonymous && !signingIntoExisting
          ? await supabase.auth.updateUser({ email })
          : await supabase.auth.signInWithOtp({ email })
      ).error;
      if (isAnonymous && !signingIntoExisting && error?.code === "email_exists") {
        error = (await supabase.auth.signInWithOtp({ email })).error;
        setSigningIntoExisting(true);
      }
      if (error) {
        setResendError(friendlyAuthError(error));
        return false;
      }
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setJustResent(true);
      setTimeout(() => setJustResent(false), 2000);
      return true;
    } catch (e) {
      setResendError(e instanceof Error ? e.message : "Couldn't resend — try again.");
      return false;
    }
  }

  // NOTE for QA (see the simplified-onboarding spike note / ADR 0006): this is the one branch
  // point that could not be exercised end-to-end against a live Supabase instance during
  // implementation (no test/staging project was available). Before shipping, verify against a
  // real (ideally non-production) Supabase project: (1) `auth.uid()` is identical before and
  // after `verifyOtp({ type: "email_change" })` for an anonymous session — i.e. linking, not a
  // fresh identity; and (2) which email template actually fires for the `updateUser` path
  // ("Confirm signup" vs. "Change Email Address" in the Supabase dashboard) — it must send
  // 6-digit-code copy, not a magic-link URL. That template alignment is a dashboard config task
  // outside this repo's code.
  /** Returns whether the code was confirmed successfully. */
  async function confirmCode(inputCode: string): Promise<boolean> {
    if (inputCode.trim().length < 6) return false;
    setVerifyError(null);
    setVerifying(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const isAnonymous = user?.is_anonymous === true;
      // signingIntoExisting overrides the isAnonymous-derived branch: the session is still
      // anonymous right up until this verifyOtp succeeds, but sendCode/resend already fell back
      // to a plain sign-in (because the email belongs to an existing permanent account), so this
      // must verify as a sign-in ("email"), not a linking ("email_change") — the latter would
      // just fail with the same email_exists error all over again.
      const { error } = isAnonymous && !signingIntoExisting
        ? await supabase.auth.verifyOtp({ email, token: inputCode.trim(), type: "email_change" })
        : await supabase.auth.verifyOtp({ email, token: inputCode.trim(), type: "email" });
      if (error) {
        setVerifyError(friendlyAuthError(error));
        return false;
      }
      return true;
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Couldn't confirm that code — try again.");
      return false;
    } finally {
      setVerifying(false);
    }
  }

  /** Local, in-place transition back to the email step — no navigation involved. */
  function useDifferentEmail() {
    setPhase("email");
    setSigningIntoExisting(false);
  }

  return {
    phase,
    email,
    setEmail,
    remembered,
    sending,
    sendError,
    setSendError,
    secondsLeft,
    justResent,
    resendError,
    code,
    setCode,
    verifying,
    verifyError,
    loadRememberedEmail,
    clearRemembered,
    sendCode,
    resend,
    confirmCode,
    useDifferentEmail,
  };
}
