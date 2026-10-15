"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * The one Suggested-card "+" tap waiting for the organizer to finish verifying (ADR 0015). Exactly
 * these three fields: never the trip id, a member id, an invite code or the Other text.
 */
type PendingItem = { name: string; tappedAt: number; userId: string };

/** A pending add older than this is dropped, never replayed. */
const PENDING_ITEM_TTL_MS = 10 * 60 * 1000;

type TripVerificationContextValue = {
  verified: boolean;
  markVerified: () => void;
  /** Verified, but the organizer never picked a name (closed the tab mid-flow) — migration 0020. */
  initialNeedsName: boolean;
  /*
   * The pending Suggested-card add (starter lists). In memory only: never a URL, storage or log.
   * All optional so a test that mocks `useTripVerification` with just `verified`/`markVerified`
   * keeps working; callers use `x?.()` and treat `pendingItem` as possibly undefined.
   */
  /** The waiting item's catalog name (for the widget headline and the waiting row), if any. */
  pendingItem?: string;
  /** Records the tap (name, time, and the current session's user id); replaces any waiting item. */
  setPendingItem?: (name: string) => void;
  cancelPendingItem?: () => void;
  /** Reads and clears the slot in one step; undefined if empty, cancelled or expired. */
  takePendingItem?: () => PendingItem | undefined;
  /** Scrolls the inline verification widget into view and focuses its first input. */
  requestVerification?: () => void;
};

const TripVerificationContext = createContext<TripVerificationContextValue | null>(null);
// Lets `InlineVerifyWidget` register its element for `requestVerification` without putting a ref
// on the public context value.
const AnchorContext = createContext<{ current: HTMLDivElement | null } | null>(null);

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

  // The pending slot. `slotRef` is the source of truth for the synchronous read-and-clear in
  // `takePendingItem` (so it runs once even under StrictMode's double effects); `pendingName`
  // mirrors just the name into state so the widget headline and the waiting row re-render.
  const slotRef = useRef<PendingItem | null>(null);
  // Identifies the latest tap, so a stale async session lookup cannot resurrect a cancelled slot.
  const pendingTokenRef = useRef<object | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pendingName, setPendingName] = useState<string | undefined>(undefined);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  function clearSlot() {
    slotRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setPendingName(undefined);
  }

  function setPendingItem(name: string) {
    // Replaces any existing slot. The user id comes from the local session (no network), and a
    // cancel or a second tap that lands while this resolves wins over this stale write.
    clearSlot();
    const token = {} as object;
    pendingTokenRef.current = token;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const userId = data.session?.user.id;
        if (!userId || pendingTokenRef.current !== token) return;
        slotRef.current = { name, tappedAt: Date.now(), userId };
        setPendingName(name);
        // TTL: the timer clears the state at expiry so nothing keeps promising an add that will
        // not happen; `takePendingItem` also checks the age on read.
        timerRef.current = setTimeout(clearSlot, PENDING_ITEM_TTL_MS);
      })
      .catch(() => {});
  }

  function cancelPendingItem() {
    pendingTokenRef.current = null;
    clearSlot();
  }

  function takePendingItem(): PendingItem | undefined {
    const slot = slotRef.current;
    pendingTokenRef.current = null;
    clearSlot();
    if (!slot || Date.now() - slot.tappedAt > PENDING_ITEM_TTL_MS) return undefined;
    return slot;
  }

  function requestVerification() {
    const anchor = anchorRef.current;
    if (!anchor) return;
    anchor.scrollIntoView?.({ block: "center", behavior: "smooth" });
    anchor.querySelector<HTMLInputElement>("input")?.focus();
  }

  // Sign-out ends any pending add. (Signing in to a different existing account does not emit
  // SIGNED_OUT; the replay's user-id check covers that.)
  useEffect(() => {
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        pendingTokenRef.current = null;
        clearSlot();
      }
    });
    return () => {
      data.subscription.unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
    <TripVerificationContext.Provider
      value={{
        verified,
        markVerified,
        initialNeedsName,
        pendingItem: pendingName,
        setPendingItem,
        cancelPendingItem,
        takePendingItem,
        requestVerification,
      }}
    >
      <AnchorContext.Provider value={anchorRef}>{children}</AnchorContext.Provider>
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
  const { verified, markVerified, initialNeedsName, pendingItem, cancelPendingItem } = useTripVerification();
  const anchorRef = useContext(AnchorContext);
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
      <div ref={anchorRef} className="rounded-[20px] p-4" style={{ background: CTA_BACKGROUND }}>
        <InlineOtpPanel
          otp={otp}
          emailInputId="verify-email"
          emailIntro={
            <div className="text-[15px] font-semibold leading-[1.35]">
              {/* The name is catalog text from the Suggested card, never the Other text. */}
              {pendingItem
                ? `Confirm your email to add '${pendingItem}' to the list.`
                : "Confirm your email to start adding expenses or inviting others."}
            </div>
          }
          onConfirm={handleConfirm}
        />
        {pendingItem ? (
          <button
            type="button"
            onClick={() => cancelPendingItem?.()}
            className="mt-1 flex h-11 w-full cursor-pointer items-center justify-center text-[13px] font-medium text-ink/60"
          >
            Cancel adding &apos;{pendingItem}&apos;
          </button>
        ) : null}
      </div>
    </>
  );
}
