"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowsLeftRightIcon, CheckIcon, PeopleIcon } from "@/components/icons";
import { Button, Field, IconLinkButton } from "@/components/ui";
import { useOtpFlow } from "@/lib/use-otp-flow";

/**
 * Hide-until-verified + inline OTP for the organizer's own trip (Decisions 12–13; see
 * docs/features/simplified-onboarding/design.md section 4 and architecture.md's "Update:
 * hide-and-reveal replaces attempt-then-redirect for the organizer"). This is the small
 * `"use client"` leaf `src/app/trip/[id]/page.tsx` (a Server Component) wraps its mutating
 * entry points in — the trip summary/detail rendering above and below it stays server-rendered,
 * unchanged.
 *
 * `TripVerificationProvider` holds one shared `verified` boolean (initialized from the server's
 * `user.is_anonymous !== true`) so the icon row, the BottomBar, and the inline CTA card — three
 * separate spots in the page's JSX — all react to the same state instantly, without each needing
 * its own prop-drilled copy.
 */

type TripVerificationContextValue = {
  verified: boolean;
  markVerified: () => void;
};

const TripVerificationContext = createContext<TripVerificationContextValue | null>(null);

/**
 * Exported (shopping-list) so a descendant client component that isn't itself one of the three
 * leaves already defined below (e.g. `shopping-list-tab.tsx`, gating claim/unclaim/delete/add
 * controls the same hide-until-verified way — design.md section 2) can read the same shared
 * `verified` flag instead of re-deriving an approximation of it.
 */
export function useTripVerification(): TripVerificationContextValue {
  const ctx = useContext(TripVerificationContext);
  if (!ctx) {
    throw new Error("useTripVerification must be used within a TripVerificationProvider");
  }
  return ctx;
}

export function TripVerificationProvider({
  initialIsVerified,
  children,
}: {
  initialIsVerified: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [verified, setVerified] = useState(initialIsVerified);

  function markVerified() {
    // Flip local state immediately so the buttons reappear with no perceptible delay (the RLS
    // predicates are already satisfied the instant verifyOtp resolves — this isn't a client
    // guessing ahead of the server). router.refresh() reconciles the rest of the server-rendered
    // page (e.g. `view`/`you` under the now-permanent auth.uid()) in the background — see
    // architecture.md's "recommended" approach, which this implements exactly.
    setVerified(true);
    router.refresh();
  }

  return (
    <TripVerificationContext.Provider value={{ verified, markVerified }}>
      {children}
    </TripVerificationContext.Provider>
  );
}

/**
 * The roster/Invite and Settle-up icon buttons (design.md section 4.0) — hidden entirely while
 * the organizer's session is unverified, not disabled. "New trip" and "Send feedback" are not
 * mutations of this trip (Decision 2/11) and are rendered outside this gate, unconditionally.
 */
export function VerifiedActionIcons({ tripId }: { tripId: string }) {
  const { verified } = useTripVerification();
  if (!verified) return null;
  return (
    <>
      <IconLinkButton title="Trip roster" className="text-ink/[0.73]" href={`/trip/${tripId}/invite`}>
        <PeopleIcon size={19} strokeWidth={2.2} />
      </IconLinkButton>
      <IconLinkButton
        title="Settle up"
        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-deep)" }}
        href={`/trip/${tripId}/settle-up`}
      >
        <ArrowsLeftRightIcon size={19} strokeWidth={2.2} />
      </IconLinkButton>
    </>
  );
}

/**
 * BottomBar contents — the normal Add-expense/locked-trip button when verified, nothing at all
 * while unverified (design.md 4.1: "not rendered at all while unverified" — there's nothing else
 * that belongs in a sticky bottom bar for this state).
 */
export function VerifiedBottomBarContent({ children }: { children: ReactNode }) {
  const { verified } = useTripVerification();
  if (!verified) return null;
  return <>{children}</>;
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const CTA_BACKGROUND = "var(--color-accent-soft)";

/**
 * The persistent inline verification CTA (design.md sections 4.1/4.2). Renders in place of the
 * hidden entry points while unverified; on confirm success shows a brief "You're verified."
 * state, then unmounts itself (via `markVerified`) so the icons/BottomBar reappear.
 */
export function InlineVerifyWidget() {
  const { verified, markVerified } = useTripVerification();
  const otp = useOtpFlow();
  const [justVerified, setJustVerified] = useState(false);

  useEffect(() => {
    otp.loadRememberedEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (verified) return null;

  async function handleSend() {
    await otp.sendCode(otp.email);
  }

  async function handleConfirm() {
    const ok = await otp.confirmCode(otp.code);
    if (!ok) return;
    setJustVerified(true);
    // Same ~1s timing convention as this screen's own "Code sent" resend confirmation — see
    // design.md section 4.2. Buttons reappear only after this brief window, giving the
    // background router.refresh() time to land without ever flashing a stale/incomplete row.
    setTimeout(markVerified, 900);
  }

  const showClear = otp.remembered !== "" && otp.email === otp.remembered;

  if (justVerified) {
    return (
      <>
        <div className="h-3.5" />
        <div className="flex items-center gap-2.5 rounded-[20px] p-4" style={{ background: CTA_BACKGROUND }}>
          <div
            className="flex size-8 flex-none items-center justify-center rounded-full text-white"
            style={{ background: "var(--color-accent)" }}
          >
            <CheckIcon size={16} strokeWidth={3} />
          </div>
          <div className="text-[15px] font-semibold">You&apos;re verified.</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="h-3.5" />
      <div className="rounded-[20px] p-4" style={{ background: CTA_BACKGROUND }}>
        {otp.phase === "email" ? (
          <>
            <div className="text-[15px] font-semibold leading-[1.35]">
              Confirm your email to start adding expenses or inviting others.
            </div>
            <div className="h-3" />
            <div className="relative">
              <Field
                id="verify-email"
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
            <Button variant="accent" className="text-[15px]" onClick={handleSend} disabled={otp.sending}>
              {otp.sending ? "Sending…" : "Send me a sign-in code"}
            </Button>
          </>
        ) : (
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
              onClick={handleConfirm}
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
        )}
      </div>
    </>
  );
}
