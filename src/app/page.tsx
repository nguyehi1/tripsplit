"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { Button, Field, Screen, ScreenContent } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth-errors";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "@/lib/remembered-email";
import { createClient } from "@/lib/supabase/client";

function extractInviteCode(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}

function SignInContent() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState(() => getRememberedEmail());
  const [remembered, setRemembered] = useState(() => getRememberedEmail());
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
        setError(friendlyAuthError(authError));
        return;
      }
      setRememberedEmail(email);
      setRemembered(email);
      router.push(
        `/check-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectUrl.toString())}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setSending(false);
    }
  }

  function handleClearRemembered() {
    clearRememberedEmail();
    setRemembered("");
    setEmail("");
    document.getElementById("email")?.focus();
  }

  // Hides itself once the user edits away from the remembered value (they've
  // already solved their own problem by typing over it), and reappears if
  // they clear back to empty or retype the exact remembered address.
  const showClear = remembered !== "" && email === remembered;

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

        <div className="relative">
          <Field
            id="email"
            name="email"
            autoComplete="email"
            label="Your email"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
