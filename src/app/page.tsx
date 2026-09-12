"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { Button, Field, Screen, ScreenContent } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function extractInviteCode(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}

function SignInContent() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const supabase = createClient();
      const redirectUrl = new URL("/auth/callback", window.location.origin);
      if (next) redirectUrl.searchParams.set("next", next);
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectUrl.toString() },
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.push(
        `/check-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectUrl.toString())}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen>
      <ScreenContent className="pt-8">
        <div
          className="flex size-[42px] items-center justify-center rounded-[14px] text-[17px] font-bold text-white"
          style={{ background: "var(--color-accent)" }}
        >
          ts
        </div>
        <div className="h-7" />
        <h1 className="text-display text-[42px]">
          Trips are fun.
          <br />
          The math isn&apos;t.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[290px] text-[15px] leading-[1.5] text-ink/[0.73]">
          Join with one link, log what you spend, and we&apos;ll work out who owes who.
        </p>
        <div className="h-7" />

        <Field
          label="Your email"
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? <p className="mt-2 text-[13px] text-terracotta">{error}</p> : null}
        <div className="h-2.5" />
        <Button variant="accent" className="text-[16px]" onClick={sendLink} disabled={sending}>
          {sending ? "Sending…" : "Send me a sign-in link"}
          {sending ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
        </Button>
        <div className="h-2.5" />
        <Button
          variant="ghost"
          className="h-[52px] text-[15px]"
          style={{ color: "var(--color-accent-strong)" }}
          onClick={() => {
            const input = window.prompt("Paste your invite link or code");
            if (input) router.push(`/join/${extractInviteCode(input)}`);
          }}
        >
          I have an invite link
        </Button>

        <div className="h-6" />
        <div className="flex gap-2.5">
          <div className="flex-1 rounded-[20px] p-4 pb-3.5" style={{ background: "oklch(0.95 0.04 88)" }}>
            <div className="text-display text-[30px]">∞</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.35] text-ink/[0.73]">expenses a day</div>
          </div>
          <div className="flex-1 rounded-[20px] p-4 pb-3.5" style={{ background: "oklch(0.95 0.035 44)" }}>
            <div className="text-display text-[30px]">0</div>
            <div className="mt-1.5 text-[12.5px] leading-[1.35] text-ink/[0.73]">accounts to join</div>
          </div>
        </div>
      </ScreenContent>
    </Screen>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
