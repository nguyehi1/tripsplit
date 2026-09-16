"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, MailIcon } from "@/components/icons";
import { BottomBar, Button, Field, IconButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth-errors";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 60;

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function CheckEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "you@email.com";
  const back = params.get("back") ?? "/";
  const next = params.get("next") ?? "/trips";
  const invite = params.get("invite");
  const displayName = params.get("name") ?? "";
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [justResent, setJustResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function resend() {
    if (secondsLeft > 0) return;
    setResendError(null);
    setVerifyError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) {
        setResendError(friendlyAuthError(error));
        return;
      }
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      setJustResent(true);
      setTimeout(() => setJustResent(false), 2000);
    } catch (e) {
      setResendError(e instanceof Error ? e.message : "Couldn't resend — try again.");
    }
  }

  async function confirm() {
    if (code.trim().length < 6) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
      if (error) {
        setVerifyError(friendlyAuthError(error));
        return;
      }
      trackEvent("sign_in_complete");
      if (invite) {
        const res = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteCode: invite, displayName }),
        });
        const data = await res.json();
        if (!res.ok) {
          router.push(`/join/${invite}?error=join`);
          return;
        }
        router.push(`/join/${invite}/welcome?tripId=${data.tripId}`);
        return;
      }
      router.push(next);
    } catch (e) {
      setVerifyError(e instanceof Error ? e.message : "Couldn't confirm that code — try again.");
    } finally {
      setVerifying(false);
    }
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
          We sent a 6-digit code to <strong className="font-semibold">{email}</strong>. It works
          once, and it expires in 60 minutes.
        </p>
        <div className="h-[22px]" />
        <Field
          label="Sign-in code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          inputClassName="tracking-[0.3em] text-center"
        />
        {verifyError ? <p className="mt-2 text-[13px] text-terracotta">{verifyError}</p> : null}
        <div className="h-3.5" />
        <p className="text-[12.5px] text-ink/[0.72]">
          {secondsLeft > 0
            ? `Didn't arrive? Check spam, or resend in ${formatCountdown(secondsLeft)}`
            : "Didn't arrive? Check spam, or resend it below"}
        </p>
        {resendError ? <p className="mt-2 text-[13px] text-terracotta">{resendError}</p> : null}
        <Button
          variant="ghost"
          className="h-9 px-0 text-[13.5px]"
          style={{ color: "var(--color-accent-strong)" }}
          disabled={secondsLeft > 0}
          onClick={resend}
        >
          {justResent ? "Code sent" : secondsLeft > 0 ? `Resend code (${formatCountdown(secondsLeft)})` : "Resend code"}
        </Button>
        <div className="h-3" />
        <Button variant="ghost" className="h-[50px] text-[14px]" onClick={() => router.push(back)}>
          Use a different email
        </Button>
      </ScreenContent>
      <BottomBar>
        <Button
          variant={verifying || code.trim().length < 6 ? "muted" : "primary"}
          className="text-[15.5px]"
          disabled={verifying || code.trim().length < 6}
          onClick={confirm}
        >
          {verifying ? "Confirming…" : "Confirm code"}
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
