"use client";

import { useLayoutEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "@/components/icons";
import { DogFace } from "@/components/brand/dog-face";
import { Wordmark } from "@/components/brand/wordmark";
import { TemplateShelf } from "@/components/template-shelf";
import { Button, Field, ScreenContent } from "@/components/ui";
import { friendlyAuthError } from "@/lib/auth-errors";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "@/lib/remembered-email";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";

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
      <p className="max-w-[290px] text-[15px] leading-[1.5] text-muted">
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
      {/* User correction, 2026-10-18 (sixth pass): the card and the dog art must tilt as ONE
       *  rigid sticker — rotating only the image inside a level card clipped a straight edge
       *  across the art at an angle, which read as crooked rather than tilted. The `rotate`
       *  transform now lives on the tile itself (bg fill + clip boundary + `DogFace` all rotate
       *  together), so the art and its frame are always at the same angle. "Divide by 6?" is a
       *  thought, not a caption: a two-dot trail (classic thought-bubble shorthand) leads from
       *  the tilted tile's visual top-right corner up to the bubble. The dot/bubble offsets below
       *  are hand-placed for the tile's current 8deg rotation — if that angle changes, the trail's
       *  left/top offsets need to move with it (rotate a 150x150 box around its center and the
       *  top-right corner traces an arc; these values just plot one point on it). */}
      <Wordmark width={150} height={42} />
      <div className="h-2" />
      <div className="relative" style={{ height: 212 }}>
        <div
          aria-hidden
          className="absolute flex items-center justify-center overflow-hidden rounded-[28px] shadow-card"
          style={{
            left: 0,
            top: 52,
            width: 150,
            height: 150,
            background: "var(--color-accent-soft)",
            transform: "rotate(8deg)",
          }}
        >
          <DogFace width={126} height={93} />
        </div>
        {/* Thought trail: two dots growing toward the bubble, anchored off the tile's
         *  rotated-corner position (left:0 top:52, 150x150, rotate(8deg) -> visual top-right
         *  corner sits ~(160, 63)). */}
        <span
          aria-hidden
          className="absolute rounded-full bg-white shadow-card-sm"
          style={{ left: 168, top: 59, width: 9, height: 9 }}
        />
        <span
          aria-hidden
          className="absolute rounded-full bg-white shadow-card-sm"
          style={{ left: 180, top: 46, width: 15, height: 15 }}
        />
        <div
          className="absolute whitespace-nowrap rounded-full bg-white px-4 py-2.5 text-[14px] font-semibold text-ink shadow-card"
          style={{ left: 194, top: 4, maxWidth: 150 }}
        >
          Divide by 6?
        </div>
      </div>
      <div className="h-6" />
      <h1 className="text-display text-[40px] leading-[1.02] -tracking-[0.035em]">
        You have fun.
        <br />
        Miso does the math.
      </h1>
      <div className="h-3.5" />
      <p className="max-w-[290px] text-[15px] leading-[1.5] text-muted">
        Add what you spend. Miso works out who owes who — no account needed to start.
      </p>
      <div className="h-7" />

      <TemplateShelf />
      <div className="h-[26px]" />

      <Button variant="accent" className="h-14 text-[16px]" onClick={() => router.push("/trip/new")}>
        Create your first trip
        <ArrowRightIcon size={18} strokeWidth={2.4} />
      </Button>
      <div className="h-2.5" />
      <Button
        variant="soft"
        className="h-[52px] text-[15px]"
        style={{ color: "var(--color-accent-strong)" }}
        onClick={() => router.push("/join")}
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
    </>
  );
}

export function HomeScreen({ showSignIn }: { showSignIn: boolean }) {
  return (
    <ScreenContent className="pt-8" padding="px-4">
      {showSignIn ? <SignInForm /> : <WelcomeContent />}
    </ScreenContent>
  );
}
