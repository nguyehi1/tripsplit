"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckIcon, InfoIcon } from "@/components/icons";
import { AvatarStack, BottomBar, Button, Card, Divider, Kicker, Screen, ScreenContent } from "@/components/ui";
import { getTripView, type TripView } from "@/lib/data/trips";
import { formatCents } from "@/lib/currency";
import { formatDateRange } from "@/lib/dates";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";
import { sanitizeInternalPath } from "@/lib/validation/redirect";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export default function JoinWelcomePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripId = searchParams.get("tripId");
  // Set by check-email's confirm() when this celebration screen was reached from the invitee
  // detail/add-expense trigger (design.md section 6.1) rather than the original join form — lets
  // "See the trip" land on the thing they actually asked for instead of a generic trip landing.
  const next = searchParams.get("next");
  const safeNext = sanitizeInternalPath(next, "");
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackEvent("trip_join_complete");
  }, []);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) throw new Error("Not signed in.");
        return getTripView(supabase, tripId, user.id);
      })
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the trip.");
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (!tripId || error) {
    return (
      <Screen>
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">
            {error ?? "Missing trip — try the invite link again."}
          </p>
        </ScreenContent>
      </Screen>
    );
  }

  const you = view?.you;
  const joinRank = view ? view.members.findIndex((m) => m.id === you?.id) + 1 : 0;

  return (
    <Screen>
      <ScreenContent className="pt-14">
        <div
          className="flex size-[52px] items-center justify-center rounded-[18px] text-white"
          style={{ background: "var(--color-accent)" }}
        >
          <CheckIcon size={27} strokeWidth={2.4} />
        </div>
        <div className="h-5" />
        <h1 className="text-display text-[36px]">
          You&apos;re on the
          <br />
          trip{you ? `, ${you.displayName}` : ""}.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          We emailed you a link back to {view?.trip.name ?? "your trip"} so you can find it later.
        </p>
        <div className="h-6" />

        <Card className="p-[18px]">
          <div className="text-display text-[20px]">{view?.trip.name ?? "…"}</div>
          <div className="mt-1 text-[12.5px] text-ink/[0.72]">
            {[formatDateRange(view?.trip.startsOn ?? null, view?.trip.endsOn ?? null), view?.trip.location]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="h-3.5" />
          <Divider />
          <div className="h-3.5" />
          <div className="flex items-center">
            <AvatarStack members={view?.members.slice(0, 3) ?? []} />
            {joinRank > 0 ? (
              <span className="ml-2.5 text-[12.5px] text-ink/[0.72]">
                You&apos;re the {ordinal(joinRank)} to join
              </span>
            ) : null}
          </div>
          <div className="h-3.5" />
          <Divider />
          <div className="h-3.5" />
          <div className="flex items-baseline justify-between">
            <Kicker>Spent so far</Kicker>
            <div className="text-display text-[20px]">{view ? formatCents(view.totalCents) : "…"}</div>
          </div>
        </Card>
        <div className="h-4" />

        <div className="flex items-start gap-[11px] px-1.5">
          <InfoIcon size={16} strokeWidth={2} className="mt-0.5 flex-none text-ink/[0.68]" />
          <div className="text-[12.5px] leading-[1.45] text-ink/[0.72]">Log anything you pay for.</div>
        </div>
      </ScreenContent>
      <BottomBar>
        <Button variant="primary" className="text-[16px]" onClick={() => router.push(safeNext || `/trip/${tripId}`)}>
          See the trip
        </Button>
      </BottomBar>
    </Screen>
  );
}
