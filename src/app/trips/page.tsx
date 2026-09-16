import Link from "next/link";
import { redirect } from "next/navigation";
import { LockIcon, PlusIcon } from "@/components/icons";
import { AvatarStack, Card, IconLinkButton, LinkButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { getMyTrips, type MyTrip } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

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

function TripRow({ trip }: { trip: MyTrip }) {
  return (
    <Link href={`/trip/${trip.id}`} className="block w-full cursor-pointer p-[18px] text-left">
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
    </Link>
  );
}

export default async function TripsDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defensive fallback only — src/proxy.ts already redirects unauthenticated visitors before
  // this page renders; this isn't a duplicate of that gate (see ADR 0005).
  if (!user) redirect("/");

  let trips: MyTrip[] | null = null;
  let error: string | null = null;
  try {
    trips = await getMyTrips(supabase, user.id);
  } catch {
    error = "Couldn't load your trips.";
  }

  return (
    <Screen>
      <ScreenContent className="pt-0.5">
        <TopBar title="Your trips" />
        <div className="flex justify-end py-2">
          <IconLinkButton title="New trip" href="/trip/new">
            <PlusIcon size={19} strokeWidth={2.4} />
          </IconLinkButton>
        </div>
        <div className="h-2" />

        {error ? (
          <p className="px-1 text-[13px] text-terracotta">{error}</p>
        ) : !trips || trips.length === 0 ? (
          <div className="pt-8 text-center">
            <p className="text-[15px] text-ink/70">You&apos;re not on any trips yet.</p>
            <div className="h-4" />
            <LinkButton href="/trip/new" variant="accent" block={false} className="mx-auto px-6">
              Start a trip
            </LinkButton>
          </div>
        ) : (
          <Card className="divide-y divide-ink/[0.07] p-0">
            {trips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </Card>
        )}
      </ScreenContent>
    </Screen>
  );
}
