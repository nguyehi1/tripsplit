"use client";

import type { ReactNode } from "react";
import { Button, Field } from "@/components/ui";
import { formatCountdown, type OtpFlow } from "@/lib/use-otp-flow";

/**
 * The inline email -> 6-digit code UI (email-invites design.md section 10 item 2), extracted from
 * `InlineVerifyWidget` before the `/invite/<token>` landing page became its third copy. All
 * send/confirm logic — including the anonymous-to-permanent linking fork (ADR 0006) — stays in
 * `useOtpFlow`; the caller owns the hook (so it can load the remembered email, or skip doing so)
 * and passes it in.
 *
 * Renders only the panel's contents; the caller supplies the container (the accent-soft
 * `rounded-[20px] p-4` panel). The remembered email is only ever a prefill, never a session:
 * nothing is sent until the visitor taps the send button.
 */
export function InlineOtpPanel({
  otp,
  emailIntro,
  emailInputId,
  sendLabel = "Send me a sign-in code",
  sendIcon,
  onConfirm,
}: {
  otp: OtpFlow;
  /** Headline (and optional sub-line) above the email field. */
  emailIntro: ReactNode;
  emailInputId: string;
  sendLabel?: string;
  sendIcon?: ReactNode;
  /** Called after the visitor taps "Confirm code"; typically `otp.confirmCode` plus what follows. */
  onConfirm: () => void;
}) {
  const showClear = otp.remembered !== "" && otp.email === otp.remembered;

  if (otp.phase === "email") {
    return (
      <>
        {emailIntro}
        <div className="h-3" />
        <div className="relative">
          <Field
            id={emailInputId}
            name="email"
            autoComplete="email"
            label="Your email"
            type="email"
            placeholder="you@email.com"
            value={otp.email}
            onChange={(e) => otp.setEmail(e.target.value)}
          />
          {showClear ? (
            <button
              type="button"
              onClick={otp.clearRemembered}
              className="absolute right-0 top-0 -m-2 p-2 text-[12px] font-medium"
              style={{ color: "var(--color-accent-strong)" }}
            >
              Not you? Clear
            </button>
          ) : null}
        </div>
        {otp.sendError ? <p className="mt-2 text-[13px] text-terracotta">{otp.sendError}</p> : null}
        <div className="h-2.5" />
        <Button
          variant="accent"
          className="text-[15px]"
          onClick={() => otp.sendCode(otp.email)}
          disabled={otp.sending}
        >
          {otp.sending ? "Sending…" : sendLabel}
          {otp.sending ? null : sendIcon}
        </Button>
      </>
    );
  }

  return (
    <>
      <div className="text-[14px] leading-[1.4] text-ink/80">
        We sent a code to <strong className="font-semibold">{otp.email}</strong>. Enter it below.
      </div>
      <div className="h-3" />
      <Field
        label="Sign-in code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        value={otp.code}
        onChange={(e) => otp.setCode(e.target.value.replace(/\D/g, ""))}
        inputClassName="tracking-[0.3em] text-center"
      />
      {otp.verifyError ? <p className="mt-2 text-[13px] text-terracotta">{otp.verifyError}</p> : null}
      <div className="h-2.5" />
      <Button
        variant="accent"
        className="text-[15px]"
        onClick={onConfirm}
        disabled={otp.verifying || otp.code.trim().length < 6}
      >
        {otp.verifying ? "Confirming…" : "Confirm code"}
      </Button>
      <div className="h-2.5" />
      <div className="flex items-center justify-between">
        <button type="button" onClick={otp.useDifferentEmail} className="text-[12.5px] font-medium text-ink/60">
          Use a different email
        </button>
        <button
          type="button"
          disabled={otp.secondsLeft > 0}
          onClick={otp.resend}
          className="text-[12.5px] font-medium"
          style={{ color: otp.secondsLeft > 0 ? undefined : "var(--color-accent-strong)" }}
        >
          {otp.justResent
            ? "Code sent"
            : otp.secondsLeft > 0
              ? `Resend code (${formatCountdown(otp.secondsLeft)})`
              : "Resend code"}
        </button>
      </div>
      {otp.resendError ? <p className="mt-1.5 text-[12px] text-terracotta">{otp.resendError}</p> : null}
    </>
  );
}
