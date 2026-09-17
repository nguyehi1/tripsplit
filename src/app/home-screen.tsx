"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { Button, Field, ScreenContent } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth-errors";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "@/lib/remembered-email";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";

function extractInviteCode(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}

/**
 * The "no browser memory" returning-visitor sign-in form (design.md section 8) — the same
 * email + code pattern this app has always used, just no longer the default content at `/`.
 * Reached via `/?signin=1`, which is reachable even when a stale anonymous session already
 * exists on this browser (e.g. an abandoned trip-creation attempt) — so, unlike the original
 * comment here claimed, an anonymous session is not guaranteed absent. `sendLink()` signs one
 * out first (see below) so it always takes the `signInWithOtp`/`type: "email"` branch
 * downstream in `/check-email`, keeping the two ends of that flow unambiguous.
 */
function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [remembered, setRemembered] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    const stored = getRememberedEmail();
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(stored);
      setRemembered(stored);
    }
  }, []);

  async function sendLink() {
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      trackEvent("sign_in_start");
      const supabase = createClient();
      // A plain "sign in with a different, already-verified email" is a distinct intent from
      // "link my current anonymous trip to an email" (that flow is triggered contextually from
      // the trip itself — see /check-email's sendCode() — not from this standalone sign-in
      // link). If a stale, never-confirmed anonymous session exists here, abandon it before
      // sending the code: it had no confirmed identity to lose, and leaving it active would
      // make /check-email's confirm() re-derive `isAnonymous` from that stale session and call
      // verifyOtp with the wrong `type` (`email_change`) for a code that was actually sent via
      // signInWithOtp (`type: "email"`), failing confirmation. Signing out first guarantees the
      // send and confirm steps agree on which flow they're in.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.is_anonymous === true) {
        await supabase.auth.signOut();
      }
      const { error: authError } = await supabase.auth.signInWithOtp({ email });
      if (authError) {
        setError(friendlyAuthError(authError));
        return;
      }
      setRememberedEmail(email);
      setRemembered(email);
      router.push(`/check-email?email=${encodeURIComponent(email)}`);
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

  const showClear = remembered !== "" && email === remembered;

  return (
    <>
      <h1 className="text-display text-[34px]">
        Sign back
        <br />
        in.
      </h1>
      <div className="h-3.5" />
      <p className="max-w-[290px] text-[15px] leading-[1.5] text-ink/[0.73]">
        Enter the email you used before — we&apos;ll send a fresh sign-in code.
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
        {sending ? "Sending…" : "Send me a sign-in code"}
        {sending ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
      </Button>
      <div className="h-2.5" />
      <Button variant="ghost" className="h-[52px] text-[15px]" onClick={() => router.push("/")}>
        Back
      </Button>
    </>
  );
}

/** The welcome screen redesign (design.md section 2) — "Create your first trip" replaces the
 * old email-first primary action. `/trip/new` itself starts the anonymous session on submit
 * (see architecture.md), so this button is a plain navigation link, not an async action. */
function WelcomeContent() {
  const router = useRouter();

  return (
    <>
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
        Add what you spend. We&apos;ll work out who owes who — no account needed to start.
      </p>
      <div className="h-7" />

      <Button variant="accent" className="text-[16px]" onClick={() => router.push("/trip/new")}>
        Create your first trip
        <ArrowRightIcon size={18} strokeWidth={2.4} />
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
      <div className="h-1" />
      <Button
        variant="ghost"
        className="h-11 text-[13.5px]"
        style={{ color: "var(--color-accent-strong)" }}
        onClick={() => router.push("/?signin=1")}
      >
        Already have a trip? Sign in
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
    </>
  );
}

export function HomeScreen({ showSignIn }: { showSignIn: boolean }) {
  return <ScreenContent className="pt-8">{showSignIn ? <SignInForm /> : <WelcomeContent />}</ScreenContent>;
}
