"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ClockIcon, MailIcon } from "@/components/icons";
import { BottomBar, Button, Card, IconButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth-errors";
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
  const redirect = params.get("redirect");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [justResent, setJustResent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, [secondsLeft]);

  async function resend() {
    if (secondsLeft > 0 || !redirect) return;
    setResendError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect },
      });
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
          Check your
          <br />
          email.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          We sent a sign-in link to <strong className="font-semibold">{email}</strong>. It works
          once, and it expires in 15 minutes.
        </p>
        <div className="h-[22px]" />
        <Card className="flex items-center gap-[13px] p-4">
          <span className="flex size-9 flex-none items-center justify-center rounded-full bg-ink/[0.05] text-ink/[0.72]">
            <ClockIcon size={18} strokeWidth={2.2} />
          </span>
          <div className="flex-1 text-[13.5px] leading-[1.4] text-ink/70">
            Didn&apos;t arrive?
            <br />
            <span className="text-[12.5px] text-ink/[0.72]">
              {secondsLeft > 0
                ? `Check spam, or resend in ${formatCountdown(secondsLeft)}`
                : "Check spam, or resend it below"}
            </span>
          </div>
        </Card>
        {resendError ? <p className="mt-3 text-[13px] text-terracotta">{resendError}</p> : null}
        <div className="h-3" />
        <Button variant="ghost" className="h-[50px] text-[14px]" onClick={() => router.push(back)}>
          Use a different email
        </Button>
      </ScreenContent>
      <BottomBar>
        <Button
          variant={secondsLeft > 0 || !redirect ? "muted" : "primary"}
          className="text-[15.5px]"
          disabled={secondsLeft > 0 || !redirect}
          onClick={resend}
        >
          {justResent ? "Link sent" : secondsLeft > 0 ? `Resend link (${formatCountdown(secondsLeft)})` : "Resend link"}
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
