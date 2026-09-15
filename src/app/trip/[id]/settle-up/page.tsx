"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRightIcon, ChevronLeftIcon, CheckIcon, LockIcon } from "@/components/icons";
import { Avatar, BottomBar, Button, Card, IconButton, Kicker, Screen, ScreenContent, TopBar } from "@/components/ui";
import { displayNameFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import { completeTrip, getTripView, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

export default function SettleUpPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [paid, setPaid] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
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
  }, [id]);

  async function handleComplete() {
    setLocking(true);
    try {
      const supabase = createClient();
      await completeTrip(supabase, id);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) setView(await getTripView(supabase, id, user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't lock the trip — try again.");
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
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">{error}</p>
        </ScreenContent>
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen>
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">Loading…</p>
        </ScreenContent>
      </Screen>
    );
  }

  const { trip, members, settlements, totalCents, you } = view;

  if (!trip.isCompleted) {
    return (
      <Screen>
        <ScreenContent className="pt-4">
          <Card className="flex items-center justify-between p-4">
            <div>
              <div className="text-display text-[20px]">{trip.name}</div>
              <div className="mt-[3px] text-[12px] text-ink/[0.72]">
                {formatDateRange(trip.startsOn, trip.endsOn)} · {members.length} people
              </div>
            </div>
            <div className="text-right">
              <Kicker>Total</Kicker>
              <div className="text-display mt-[3px] text-[20px]">{formatCents(totalCents)}</div>
            </div>
          </Card>
          <div className="h-3.5" />
          <TopBar title="Settle up" leading={backButton} />
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
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenContent className="pt-4">
        <TopBar title="Settle up" leading={backButton} />
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
                <div className="h-3" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink/60">
                    {paid.has(i) ? "Paid" : "Not paid yet"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPaid((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className="flex h-[38px] cursor-pointer items-center gap-1.5 rounded-full border-2 border-ink px-3.5 text-[12px] font-bold uppercase tracking-[0.08em]"
                  >
                    {paid.has(i) ? <CheckIcon size={13} strokeWidth={3} /> : null}
                    {paid.has(i) ? "Paid" : "Mark paid"}
                  </button>
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
      </ScreenContent>
      <BottomBar>
        <Button variant="muted" className="h-[50px] text-[14px]">
          <CheckIcon size={16} strokeWidth={2.6} />
          Trip completed
        </Button>
      </BottomBar>
    </Screen>
  );
}
