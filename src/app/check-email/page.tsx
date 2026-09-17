"use client";

import { Suspense, useLayoutEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, ChevronLeftIcon, MailIcon } from "@/components/icons";
import { BottomBar, Button, Field, IconButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { trackEvent } from "@/lib/tracking";
import { useOtpFlow } from "@/lib/use-otp-flow";

// Contextual mutation triggers (simplified-onboarding): who's being asked to confirm, and what
// for — controls the headline/sub-copy on the email-entry step below. See
// docs/features/simplified-onboarding/design.md sections 4/6 for the exact copy this maps to.
//
// Decision 12 (hide-and-reveal for the organizer) removed the three organizer-only trigger
// values this union used to carry ("add-expense", "invite", "placeholder") — the organizer's own
// mutation entry points are hidden pre-verification instead of attempted-then-redirected, so
// nothing navigates here with those values anymore. See
// docs/features/simplified-onboarding/architecture.md's "Fate of /check-email and its ?trigger="
// params". Only the invitee's two triggers remain.
type Trigger = "detail" | "invitee-expense";

function isTrigger(value: string | null): value is Trigger {
  return value === "detail" || value === "invitee-expense";
}

function triggerHeadline(trigger: Trigger) {
  switch (trigger) {
    case "detail":
      return "Confirm your email to see the full expense list.";
    case "invitee-expense":
      return "Confirm your email to add an expense.";
  }
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CheckEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const emailParam = params.get("email");
  const back = params.get("back") ?? "/";
  const next = params.get("next") ?? "/trips";
  const invite = params.get("invite");
  const triggerParam = params.get("trigger");
  const trigger = isTrigger(triggerParam) ? triggerParam : null;
  const tripName = params.get("tripName") ?? "";

  // Two phases: "email" (the contextual OTP trigger's own email-entry step, reusing the old `/`'s
  // Field + "Send me a sign-in code" pattern, per design.md section 4.1 option 1) and "code" (the
  // existing 6-digit entry screen). Existing callers (`/`'s plain sign-in, `/join/[code]`'s old
  // form) already send the code themselves and arrive with `email` (and, for a join, `name`) set,
  // so they skip straight to "code" exactly as today. Both phases, and the isAnonymous
  // send/confirm fork underneath them, are implemented once in `useOtpFlow` — see
  // docs/features/simplified-onboarding/architecture.md's "Shared OTP logic" section.
  const otp = useOtpFlow({ initialEmail: emailParam ?? "", skipToCode: Boolean(emailParam) });

  // The invitee's display name — the redesigned `/join/[code]` summary view (design.md section
  // 5) no longer collects it up front, so this contextual email-entry step collects it here
  // instead, for an `invite`-flow visitor only. A caller can still pass `name` directly (kept
  // for backward compatibility, unused by any current call site).
  const [name, setName] = useState(params.get("name") ?? "");

  useLayoutEffect(() => {
    if (emailParam) return;
    otp.loadRememberedEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClearRemembered() {
    otp.clearRemembered();
    document.getElementById("email")?.focus();
  }
  const showClear = otp.remembered !== "" && otp.email === otp.remembered;

  async function handleSendCode() {
    if (invite && !name.trim()) {
      otp.setSendError("Your name and email are both required.");
      return;
    }
    trackEvent("sign_in_start");
    await otp.sendCode(otp.email);
  }

  async function handleConfirm() {
    const ok = await otp.confirmCode(otp.code);
    if (!ok) return;
    try {
      trackEvent("sign_in_complete");
      if (invite) {
        const res = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteCode: invite, displayName: name }),
        });
        const data = await res.json();
        if (!res.ok) {
          router.push(`/join/${invite}?error=join`);
          return;
        }
        const welcomeUrl = new URL(`/join/${invite}/welcome`, window.location.origin);
        welcomeUrl.searchParams.set("tripId", data.tripId);
        if (next !== "/trips") welcomeUrl.searchParams.set("next", next);
        router.push(`${welcomeUrl.pathname}${welcomeUrl.search}`);
        return;
      }
      router.push(next);
    } catch {
      // Best-effort post-confirm navigation — the session is already verified either way.
    }
  }

  if (otp.phase === "email") {
    return (
      <Screen>
        <ScreenContent className="pt-8">
          <TopBar
            title="Sign in"
            leading={
              <IconButton onClick={() => router.push(back)}>
                <ChevronLeftIcon size={19} strokeWidth={2.3} />
              </IconButton>
            }
          />
          <div className="h-6" />
          <h1 className="text-display text-[34px]">{trigger ? triggerHeadline(trigger) : "Confirm your email."}</h1>
          {trigger === "detail" || trigger === "invitee-expense" ? (
            <>
              <div className="h-3" />
              <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
                You&apos;ll be able to see every expense and add your own —{" "}
                {tripName ? `${tripName} keeps` : "we keep"} your email just to know it&apos;s you next time.
              </p>
            </>
          ) : null}
          <div className="h-7" />

          {invite ? (
            <>
              <Field
                label="Your name"
                placeholder="e.g. Cleo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="h-4" />
            </>
          ) : null}

          <div className="relative">
            <Field
              id="email"
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
                onClick={handleClearRemembered}
                className="absolute right-0 top-0 -m-2 p-2 text-[12px] font-medium"
                style={{ color: "var(--color-accent-strong)" }}
              >
                Not you? Clear
              </button>
            ) : null}
          </div>
          {otp.sendError ? <p className="mt-2 text-[13px] text-terracotta">{otp.sendError}</p> : null}
          <div className="h-2.5" />
          <Button variant="accent" className="text-[16px]" onClick={handleSendCode} disabled={otp.sending}>
            {otp.sending ? "Sending…" : "Send me a sign-in code"}
            {otp.sending ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
          </Button>
        </ScreenContent>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenContent>
        <TopBar
          title="Sign in"
          leading={
            <IconButton onClick={() => router.push(back)}>
              <ChevronLeftIcon size={19} strokeWidth={2.3} />
            </IconButton>
          }
        />
        <div className="h-11" />
        <div
          className="flex size-[46px] items-center justify-center rounded-[16px]"
          style={{ background: "oklch(0.95 0.04 88)", color: "oklch(0.36 0.08 80)" }}
        >
          <MailIcon size={24} />
        </div>
        <div className="h-5" />
        <h1 className="text-display text-[34px]">
          Enter your
          <br />
          code.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          We sent a 6-digit code to <strong className="font-semibold">{otp.email}</strong>. It works
          once, and it expires in 60 minutes.
        </p>
        <div className="h-[22px]" />
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
        <div className="h-3.5" />
        <p className="text-[12.5px] text-ink/[0.72]">
          {otp.secondsLeft > 0
            ? `Didn't arrive? Check spam, or resend in ${formatCountdown(otp.secondsLeft)}`
            : "Didn't arrive? Check spam, or resend it below"}
        </p>
        {otp.resendError ? <p className="mt-2 text-[13px] text-terracotta">{otp.resendError}</p> : null}
        <Button
          variant="ghost"
          className="h-9 px-0 text-[13.5px]"
          style={{ color: "var(--color-accent-strong)" }}
          disabled={otp.secondsLeft > 0}
          onClick={otp.resend}
        >
          {otp.justResent ? "Code sent" : otp.secondsLeft > 0 ? `Resend code (${formatCountdown(otp.secondsLeft)})` : "Resend code"}
        </Button>
        <div className="h-3" />
        <Button variant="ghost" className="h-[50px] text-[14px]" onClick={() => router.push(back)}>
          Use a different email
        </Button>
      </ScreenContent>
      <BottomBar>
        <Button
          variant={otp.verifying || otp.code.trim().length < 6 ? "muted" : "primary"}
          className="text-[15.5px]"
          disabled={otp.verifying || otp.code.trim().length < 6}
          onClick={handleConfirm}
        >
          {otp.verifying ? "Confirming…" : "Confirm code"}
        </Button>
      </BottomBar>
    </Screen>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
