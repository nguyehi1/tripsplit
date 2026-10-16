"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Card, Divider, Kicker, LinkButton, Screen, ScreenContent, ScreenError, ScreenLoading } from "@/components/ui";
import { initialsFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import type { InviteInfo, TripSummary } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { trackEvent } from "@/lib/tracking";

/**
 * Invitee entry point, redesigned per docs/features/simplified-onboarding/design.md section 5:
 * opening an invite link now opens directly onto the trip's public, zero-auth summary — no
 * name/email form up front. That collection is deferred to "See full details"/"Add an expense",
 * which route into the same email/OTP trigger as the organizer's (design.md section 6).
 */
function JoinTripContent() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const joinError = searchParams.get("error") === "join" ? "Couldn't join the trip — try again." : null;
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    trackEvent("trip_join_start");
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Resets on every (re)load, including a manual retry (reloadKey bump) — synchronous inside
    // the effect body is intentional here, not a derivable-from-render value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(null);
    // Goes through the server-side /api/trip-invite/[code] route rather than calling
    // `get_trip_by_invite_code` straight from the browser, so the invite-code lookup is rate-
    // limited (docs/reviews/security-compliance/project/security-review-2026-09-17.md finding #1) — see src/lib/rate-limit.ts.
    //
    // performance-scaling architecture.md's "Invite/join preview" fix: this used to be two
    // sequential browser-to-network hops — this fetch, then a second, direct-to-Supabase
    // `getTripSummary` call once `tripId` was known. The route now runs `getTripSummary`
    // server-side (still sequentially after its own invite lookup, since `getTripSummary`
    // genuinely needs the `tripId` that lookup returns — see that route's own comment) and
    // returns the combined shape, so the page makes one browser-to-network fetch instead of two.
    fetch(`/api/trip-invite/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setLoadError("This invite link doesn't match a trip anymore.");
          return;
        }
        if (res.status === 429 || res.status === 503) {
          throw new Error("Too many attempts — wait a moment and try again.");
        }
        if (!res.ok) {
          throw new Error("Couldn't load this trip — check your connection and try again.");
        }
        const result = (await res.json()) as InviteInfo & { summary: TripSummary | null };
        setInvite(result);
        setSummary(result.summary);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Couldn't load this trip — check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  if (loadError) {
    const isTerminal = loadError === "This invite link doesn't match a trip anymore.";
    return (
      <Screen>
        <ScreenError message={loadError} onRetry={isTerminal ? undefined : () => setReloadKey((k) => k + 1)} />
      </Screen>
    );
  }

  if (loading || !invite) {
    return (
      <Screen>
        <ScreenLoading label="Loading trip…" />
      </Screen>
    );
  }

  const detailNext = encodeURIComponent(`/trip/${invite.tripId}?tab=details`);
  const addExpenseNext = encodeURIComponent(`/trip/${invite.tripId}/add-expense`);
  const back = encodeURIComponent(`/join/${code}`);
  const tripNameParam = encodeURIComponent(invite.name);

  return (
    <Screen>
      <ScreenContent className="pt-3.5">
        {joinError ? (
          <>
            <p className="text-[13px] text-terracotta">{joinError}</p>
            <div className="h-3" />
          </>
        ) : null}
        <div className="rounded-[22px] p-5 text-white" style={{ background: "var(--color-accent)" }}>
          <div className="flex items-center gap-[9px]">
            <span className="flex size-7 items-center justify-center rounded-full bg-white/[0.22] text-[10px] font-semibold">
              {initialsFor(invite.organizerName ?? "?")}
            </span>
            <span className="text-[12.5px] opacity-85">
              {invite.organizerName ? `${invite.organizerName} invited you` : "You're invited"}
            </span>
          </div>
          <div className="h-3.5" />
          <div className="text-display text-[30px]">{invite.name}</div>
          <div className="h-2.5" />
          <div className="flex gap-3.5 text-[13px] opacity-85">
            {formatDateRange(invite.startsOn, invite.endsOn) ? (
              <span>{formatDateRange(invite.startsOn, invite.endsOn)}</span>
            ) : null}
            {invite.location ? <span>{invite.location}</span> : null}
          </div>
        </div>
        <div className="h-4" />

        <Card className="p-[18px]">
          <div className="flex">
            <div className="flex-1">
              <Kicker>Total so far</Kicker>
              <div className="text-display mt-1 text-[28px]">{formatCents(summary?.totalCents ?? 0)}</div>
            </div>
            <div className="mx-4 w-px bg-ink/10" />
            <div className="flex-1 text-right">
              <Kicker>Avg / person</Kicker>
              <div className="text-display mt-1 text-[28px]">{formatCents(summary?.avgPerPersonCents ?? 0)}</div>
            </div>
          </div>
          {summary && summary.settlements.length > 0 ? (
            <>
              <div className="h-4" />
              <Divider />
              <div className="h-4" />
              <Kicker>Who owes who</Kicker>
              <div className="h-2" />
              {summary.settlements.map((s, i) => (
                <div key={i} className="flex items-baseline justify-between py-1">
                  <span className="text-[14px] font-medium">
                    {s.from.displayName} owes {s.to.displayName}
                  </span>
                  <span className="text-display text-[16px]">{formatCents(s.amountCents)}</span>
                </div>
              ))}
            </>
          ) : null}
        </Card>
        <div className="h-4" />

        <div className="rounded-[20px] p-4" style={{ background: "oklch(0.95 0.04 88)" }}>
          <div className="text-[15px] font-semibold">Want the full expense list?</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink/[0.72]">
            See exactly what was spent and add your own — just confirm your email.
          </div>
          <div className="h-3" />
          <LinkButton
            href={`/check-email?trigger=detail&invite=${code}&tripName=${tripNameParam}&next=${detailNext}&back=${back}`}
            variant="accent"
            className="text-[15px]"
          >
            See full details
          </LinkButton>
          <div className="h-2" />
          <LinkButton
            href={`/check-email?trigger=invitee-expense&invite=${code}&tripName=${tripNameParam}&next=${addExpenseNext}&back=${back}`}
            variant="ghost"
            className="h-11 text-[13.5px]"
            style={{ color: "var(--color-accent-strong)" }}
          >
            Add an expense
          </LinkButton>
        </div>
      </ScreenContent>
    </Screen>
  );
}

export default function JoinTripPage() {
  return (
    <Suspense>
      <JoinTripContent />
    </Suspense>
  );
}
