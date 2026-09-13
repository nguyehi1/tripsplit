"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, PlusIcon } from "@/components/icons";
import { AvatarStack, Button, Card, IconButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { getMyTrips, type MyTrip } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

function BalanceLabel({ netCents }: { netCents: number }) {
  if (netCents === 0) return <span className="text-[12.5px] text-ink/[0.72]">Settled up</span>;
  if (netCents > 0) {
    return (
      <span className="text-[12.5px] font-semibold" style={{ color: "oklch(0.38 0.08 80)" }}>
        You&apos;re owed {formatCents(netCents)}
      </span>
    );
  }
  return (
    <span className="text-[12.5px] font-semibold" style={{ color: "var(--color-terracotta)" }}>
      You owe {formatCents(-netCents)}
    </span>
  );
}

function TripRow({ trip, onOpen }: { trip: MyTrip; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full cursor-pointer p-[18px] text-left">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-[10px] py-[4px] text-[11px] font-semibold"
          style={{ background: "oklch(0.95 0.04 88)", color: "oklch(0.38 0.08 80)" }}
        >
          Trip
        </span>
        {trip.isCompleted ? (
          <span
            className="flex items-center gap-1 rounded-full px-[10px] py-[4px] text-[11px] font-semibold"
            style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
          >
            <LockIcon size={10} strokeWidth={2.6} />
            Locked
          </span>
        ) : null}
        {formatDateRange(trip.startsOn, trip.endsOn) ? (
          <span className="text-[12px] text-ink/[0.72]">{formatDateRange(trip.startsOn, trip.endsOn)}</span>
        ) : null}
      </div>
      <div className="h-2" />
      <div className="text-display text-[22px]">{trip.name}</div>
      <div className="h-2.5" />
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <AvatarStack members={trip.members} />
          <span className="ml-2.5 text-[12px] text-ink/[0.72]">
            {trip.members.length} {trip.members.length === 1 ? "person" : "people"} ·{" "}
            {formatCents(trip.totalCents)}
          </span>
        </div>
        <BalanceLabel netCents={trip.yourNetCents} />
      </div>
    </button>
  );
}

function TripsDashboardContent() {
  const router = useRouter();
  const [trips, setTrips] = useState<MyTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(async ({ data: { user } }) => {
        if (!user) throw new Error("Not signed in.");
        return getMyTrips(supabase, user.id);
      })
      .then((result) => {
        if (!cancelled) setTrips(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your trips.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <ScreenContent className="pt-0.5">
        <TopBar title="Your trips" />
        <div className="flex justify-end py-2">
          <IconButton title="New trip" onClick={() => router.push("/trip/new")}>
            <PlusIcon size={19} strokeWidth={2.4} />
          </IconButton>
        </div>
        <div className="h-2" />

        {error ? (
          <p className="px-1 text-[13px] text-terracotta">{error}</p>
        ) : !trips ? (
          <p className="px-1 text-[15px] text-ink/70">Loading your trips…</p>
        ) : trips.length === 0 ? (
          <div className="pt-8 text-center">
            <p className="text-[15px] text-ink/70">You&apos;re not on any trips yet.</p>
            <div className="h-4" />
            <Button variant="accent" block={false} className="mx-auto px-6" onClick={() => router.push("/trip/new")}>
              Start a trip
            </Button>
          </div>
        ) : (
          <Card className="divide-y divide-ink/[0.07] p-0">
            {trips.map((trip) => (
              <TripRow key={trip.id} trip={trip} onOpen={() => router.push(`/trip/${trip.id}`)} />
            ))}
          </Card>
        )}
      </ScreenContent>
    </Screen>
  );
}

export default function TripsDashboardPage() {
  return <TripsDashboardContent />;
}
