"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowsLeftRightIcon, CheckIcon, PeopleIcon } from "@/components/icons";
import { InlineOtpPanel } from "@/components/inline-otp-panel";
import { NamePromptForm } from "@/components/name-prompt-form";
import { IconLinkButton } from "@/components/ui";
import { getMyDisplayName, setMyDisplayName } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";
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
  /** Verified, but the organizer never picked a name (closed the tab mid-flow) — migration 0020. */
  initialNeedsName: boolean;
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
  initialNeedsName = false,
  children,
}: {
  initialIsVerified: boolean;
  initialNeedsName?: boolean;
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
    <TripVerificationContext.Provider value={{ verified, markVerified, initialNeedsName }}>
      {children}
    </TripVerificationContext.Provider>
  );
}

/**
 * The roster/Invite and Settle-up icon buttons (design.md section 4.0) — hidden entirely while
 * the organizer's session is unverified, not disabled. (Feedback and "New trip" aren't trip
 * actions at all — they live on `/trips` only.)
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

const CTA_BACKGROUND = "var(--color-accent-soft)";

/**
 * The persistent inline verification CTA (design.md sections 4.1/4.2). Renders in place of the
 * hidden entry points while unverified; on confirm success shows a brief "You're verified."
 * state, then unmounts itself (via `markVerified`) so the icons/BottomBar reappear.
 */
export function InlineVerifyWidget() {
  const { verified, markVerified, initialNeedsName } = useTripVerification();
  const router = useRouter();
  const otp = useOtpFlow();
  const [justVerified, setJustVerified] = useState(false);
  // True between a confirmed code and a chosen name, for an account with no name yet (migration
  // 0020). Stays unverified-looking (icons hidden) until the name is saved.
  const [needsName, setNeedsName] = useState(initialNeedsName && verified);

  useEffect(() => {
    otp.loadRememberedEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (verified && !needsName) return null;

  async function handleConfirm() {
    const ok = await otp.confirmCode(otp.code);
    if (!ok) return;
    // An account that already has a name keeps it (and it's stamped onto this trip); only a
    // brand-new account is asked for one.
    try {
      const supabase = createClient();
      const existing = await getMyDisplayName(supabase);
      if (existing) {
        await setMyDisplayName(supabase, existing);
      } else {
        setNeedsName(true);
        return;
      }
    } catch {
      // Best-effort: fall through as verified; the trigger already stamped a placeholder name.
    }
    setJustVerified(true);
    // Same ~1s timing convention as this screen's own "Code sent" resend confirmation — see
    // design.md section 4.2. Buttons reappear only after this brief window, giving the
    // background router.refresh() time to land without ever flashing a stale/incomplete row.
    setTimeout(markVerified, 900);
  }

  async function handleSaveName(name: string) {
    await setMyDisplayName(createClient(), name);
    setNeedsName(false);
    if (verified) {
      router.refresh();
    } else {
      setJustVerified(true);
      setTimeout(markVerified, 900);
    }
  }

  if (needsName) {
    return (
      <>
        <div className="h-3.5" />
        <div className="rounded-[20px] p-4" style={{ background: CTA_BACKGROUND }}>
          <NamePromptForm
            variant="card"
            title="Almost there — what should everyone call you?"
            ctaLabel="Continue"
            onSubmit={handleSaveName}
          />
        </div>
      </>
    );
  }

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
        <InlineOtpPanel
          otp={otp}
          emailInputId="verify-email"
          emailIntro={
            <div className="text-[15px] font-semibold leading-[1.35]">
              Confirm your email to start adding expenses or inviting others.
            </div>
          }
          onConfirm={handleConfirm}
        />
      </div>
    </>
  );
}
