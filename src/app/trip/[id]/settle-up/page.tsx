"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRightIcon, ChevronLeftIcon, LockIcon } from "@/components/icons";
import { TripNavBarStatic } from "@/components/bottom-nav-bar";
import { Avatar, BottomBar, Button, Card, Divider, IconButton, Kicker, Screen, ScreenContent, ScreenError, ScreenLoading, TopBar } from "@/components/ui";
import { displayNameFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import { completeTrip, getTripView, type TripView } from "@/lib/data/trips";
import { trackEvent } from "@/lib/tracking";
import { createClient } from "@/lib/supabase/client";

export default function SettleUpPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    trackEvent("settlement_view");
  }, []);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setError(null);
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) throw new Error("Not signed in.");
        return getTripView(supabase, id, user.id);
      })
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this trip.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  async function handleComplete() {
    setLocking(true);
    try {
      const supabase = createClient();
      await completeTrip(supabase, id);
      trackEvent("settlement_complete");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setView(await getTripView(supabase, id, user.id));
    } catch {
      setError("Couldn't lock the trip — try again.");
    } finally {
      setLocking(false);
    }
  }

  const backButton = (
    <IconButton onClick={() => router.push(`/trip/${id}`)}>
      <ChevronLeftIcon size={19} strokeWidth={2.3} />
    </IconButton>
  );

  if (error) {
    return (
      <Screen>
        <ScreenError message={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen>
        <ScreenLoading label="Loading your trip…" />
      </Screen>
    );
  }

  const { trip, members, settlements, totalCents, avgPerPersonCents, you } = view;

  if (!trip.isCompleted) {
    return (
      <Screen>
        <ScreenContent className="pt-4">
          {/* No name/date/total summary card here (user feedback, 2026-10-16) — that data now
             lives inside the "Still on the mountain" card below instead of a separate header. */}
          <TopBar sticky title="Settle up" trailing={backButton} />
          <div className="h-3.5" />

          <div className="rounded-[22px] p-5" style={{ background: "var(--color-terracotta-soft)" }}>
            <div
              className="flex size-[38px] items-center justify-center rounded-[12px] bg-white"
              style={{ color: "var(--color-terracotta)" }}
            >
              <LockIcon size={20} />
            </div>
            <div className="h-3.5" />
            <div className="text-display text-[26px]">Still on the mountain.</div>
            <div className="h-2.5" />
            <p className="text-[14px] leading-[1.5] text-ink/75">
              Nothing&apos;s final until the organizer calls it. Keep logging — the running
              numbers below update every time.
            </p>
            <div className="h-4" />
            <Divider />
            <div className="h-4" />
            <div className="flex">
              <div className="flex-1">
                <Kicker>Total so far</Kicker>
                <div className="text-display mt-1 text-[24px]">{formatCents(totalCents)}</div>
              </div>
              <div className="mx-4 w-px bg-ink/10" />
              <div className="flex-1 text-right">
                <Kicker>Avg / person</Kicker>
                <div className="text-display mt-1 text-[24px]">{formatCents(avgPerPersonCents)}</div>
              </div>
            </div>
            {you ? (
              <>
                <div className="h-4" />
                <Divider />
                <div className="h-4" />
                <div className="flex items-baseline justify-between">
                  <Kicker>You&apos;ve paid so far</Kicker>
                  <div className="text-display text-[16px]">{formatCents(you.paidCents)}</div>
                </div>
                <div className="h-2" />
                <div className="flex items-baseline justify-between">
                  <Kicker>You&apos;d owe</Kicker>
                  <div className="text-display text-[16px]" style={{ color: "var(--color-terracotta)" }}>
                    {formatCents(Math.max(0, -you.netCents))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
          <div className="h-4" />
          {settlements.length > 0 ? (
            <>
              <div className="flex justify-between px-1">
                <Kicker>Provisional — as of now</Kicker>
                <Kicker>{settlements.length} transfers</Kicker>
              </div>
              <div className="h-2" />
              <Card className="px-[18px] py-1 opacity-55">
                {settlements.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between py-3.5 ${
                      i < settlements.length - 1 ? "border-b border-ink/[0.07]" : ""
                    }`}
                  >
                    <span className="text-[15px] font-medium">
                      {displayNameFor(s.from.displayName, s.from.isPlaceholder)} →{" "}
                      {displayNameFor(s.to.displayName, s.to.isPlaceholder)}
                    </span>
                    <span className="text-display text-[18px]">{formatCents(s.amountCents)}</span>
                  </div>
                ))}
              </Card>
            </>
          ) : (
            <p className="px-1 text-[13px] text-ink/60">All settled up so far — nothing owed.</p>
          )}
        </ScreenContent>
        {/* Real footer nav bar now, like every other screen (user feedback, 2026-10-16) —
           stacked above `TripNavBarStatic` the same way the main trip page stacks `BottomBar`
           above `TripNavBar` (see trip/[id]/page.tsx), not a one-off shell. */}
        <BottomBar>
          <Button
            variant="accent"
            className="text-[16px]"
            onClick={handleComplete}
            disabled={locking || !you?.isOrganizer}
          >
            {locking ? "Locking…" : "Trip complete"}
            {locking ? null : <ArrowRightIcon size={18} strokeWidth={2.4} />}
          </Button>
          <div className="h-2" />
          <p className="text-center text-[11.5px] text-ink/[0.72]">
            {you?.isOrganizer
              ? "You're the organizer — only you can lock the trip"
              : "Only the organizer can lock the trip"}
          </p>
        </BottomBar>
        <TripNavBarStatic tripId={id} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenContent className="pt-4">
        <TopBar title="Settle up" trailing={backButton} />
        <div className="h-3" />

        <div className="rounded-[22px] p-5 text-white" style={{ background: "var(--color-accent)" }}>
          <div className="flex items-center justify-between">
            <span className="flex-none whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] opacity-80">
              Trip completed
            </span>
            <span className="rounded-full bg-white/[0.18] px-[11px] py-[5px] text-[11.5px] font-semibold">
              Locked
            </span>
          </div>
          <div className="h-3.5" />
          <div className="text-display text-[34px]">
            {settlements.length === 0
              ? "All settled up."
              : settlements.length === 1
                ? "One transfer"
                : `${settlements.length} transfers`}
            {settlements.length > 0 ? (
              <>
                <br />
                and you&apos;re even.
              </>
            ) : null}
          </div>
          <div className="h-3" />
          <p className="text-[14px] leading-[1.5] opacity-85">
            The shortest way to clear {formatCents(totalCents)} across {members.length} people.{" "}
            {formatCents(Math.round(totalCents / members.length))} each.
          </p>
        </div>
        <div className="h-4" />

        {settlements.length > 0 ? (
          <Card className="px-[18px] py-1.5">
            {settlements.map((s, i) => (
              <div key={i} className={`py-4 ${i < settlements.length - 1 ? "border-b border-ink/[0.07]" : ""}`}>
                <div className="flex items-center gap-2.5">
                  <div className="flex flex-none items-center gap-[7px]">
                    <Avatar initials={s.from.initials} color={s.from.avatar} size={32} />
                    <ArrowRightIcon size={15} strokeWidth={2.4} className="text-ink/30" />
                    <Avatar initials={s.to.initials} color={s.to.avatar} size={32} />
                  </div>
                  <div className="min-w-0 flex-1 text-[14.5px] font-medium">
                    {displayNameFor(s.from.displayName, s.from.isPlaceholder)} pays{" "}
                    {displayNameFor(s.to.displayName, s.to.isPlaceholder)}
                  </div>
                  <div className="text-display text-[22px]" style={{ color: "oklch(0.4 0.08 80)" }}>
                    {formatCents(s.amountCents)}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        ) : null}
        {members.some((m) => m.isPlaceholder) ? (
          <>
            <div className="h-3" />
            <p className="px-1 text-[12.5px] leading-[1.5] text-ink/60">
              &quot;(placeholder)&quot; members can&apos;t pay in-app — settle up with them
              directly, then mark it paid.
            </p>
          </>
        ) : null}
        {/* Clearance for the nav bar below, which moves these two buttons out of the scrolling
           content (they rendered inline here before this feature — architecture.md's
           "Orientation" note: this branch had no `BottomBar` at all today). */}
        <div className="h-6" />
      </ScreenContent>
      {/* Real footer nav bar, same stacking as the ongoing branch above and the main trip page. */}
      <BottomBar>
        <Button variant="accent" className="text-[16px]" onClick={() => router.push("/trip/new")}>
          Create a new trip
          <ArrowRightIcon size={18} strokeWidth={2.4} />
        </Button>
      </BottomBar>
      <TripNavBarStatic tripId={id} />
    </Screen>
  );
}
