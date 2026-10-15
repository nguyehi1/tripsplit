import Link from "next/link";
import { createElement } from "react";
import { redirect } from "next/navigation";
import { LockIcon, MapPinIcon, MessageSquareIcon, PlusIcon } from "@/components/icons";
import { LegalLinks } from "@/components/legal-page";
import { TemplateShelf } from "@/components/template-shelf";
import { iconForTripType } from "@/components/trip-type-icons";
import { Card, FabBar, IconLinkButton, Kicker, LinkButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { TRIP_LIST_COLUMNS } from "@/lib/data/trip-columns";
import { getMyTrips, type MyTrip } from "@/lib/data/trips";
import { formatDateRangeCompact } from "@/lib/dates";
import { timeAsync } from "@/lib/perf/timing";
import { createClient } from "@/lib/supabase/server";

/**
 * Forces this page off Next's static-generation path. Without this, Next's dynamic-rendering
 * detection never gets a chance to run: it infers "dynamic" from a page's use of a dynamic API
 * (e.g. `cookies()`, inside `createClient()`), but `createClient()` throws before reaching
 * `cookies()` whenever `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` aren't set —
 * which crashes the build's prerender attempt instead of falling back to per-request rendering.
 * `/trips` is the one param-less Server Component this can happen to: every other param-less
 * Server Component under `src/app` either accesses a different dynamic API *before* any
 * Supabase call that could throw (`src/app/page.tsx` awaits `searchParams` first, which alone
 * is enough to opt it into dynamic rendering) or is a `"use client"` page with no server-side
 * Supabase call at all — so only here does an early, pre-`cookies()` throw actually hide the
 * dynamic-rendering signal from Next.
 */
export const dynamic = "force-dynamic";

/** The right-hand balance. Null when the trip has no expenses ("No expenses yet" is in the subtitle). */
function BalanceLabel({ netCents, hasExpenses }: { netCents: number; hasExpenses: boolean }) {
  if (!hasExpenses) return null;
  if (netCents === 0) return <span className="text-[12.5px] leading-[15px] text-ink/[0.72]">Settled up</span>;
  if (netCents > 0) {
    return (
      <span className="text-[12.5px] font-semibold leading-[15px]" style={{ color: "oklch(0.38 0.08 80)" }}>
        You&apos;re owed {formatCents(netCents)}
      </span>
    );
  }
  return (
    <span className="text-[12.5px] font-semibold leading-[15px]" style={{ color: "var(--color-terracotta)" }}>
      You owe {formatCents(-netCents)}
    </span>
  );
}

/**
 * One trip row, board A's anatomy (design.md 16.1): 40px icon square, 15px/600 name, 12px subtitle
 * ("date · people · total", parts skipped when absent), the balance at the right end of the name
 * line, or the Locked pill there on a completed trip (with the balance on a third line). Below
 * 360px the balance is a third line for every row. The divider is drawn by the caller on every
 * row but the last.
 */
function TripRow({ trip, isLast }: { trip: MyTrip; isLast: boolean }) {
  const icon = trip.types[0] ? iconForTripType(trip.types[0]) : MapPinIcon;
  const subtitle = [
    formatDateRangeCompact(trip.startsOn, trip.endsOn),
    `${trip.members.length} ${trip.members.length === 1 ? "person" : "people"}`,
    trip.totalCents > 0 ? formatCents(trip.totalCents) : "No expenses yet",
  ]
    .filter(Boolean)
    .join(" · ");
  const balance = <BalanceLabel netCents={trip.yourNetCents} hasExpenses={trip.totalCents > 0} />;
  const hasBalance = trip.totalCents > 0;
  return (
    <Link
      href={`/trip/${trip.id}`}
      className={`flex w-full cursor-pointer items-center gap-3 py-3.5 text-left ${isLast ? "" : "border-b border-ink/[0.15]"}`}
    >
      <span
        aria-hidden="true"
        className={`flex size-10 flex-none items-center justify-center rounded-[14px] ${
          trip.isCompleted ? "bg-ink/[0.05] text-ink/[0.74]" : ""
        }`}
        style={trip.isCompleted ? undefined : { background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
      >
        {createElement(icon, { size: 20, strokeWidth: 2 })}
      </span>
      <span className="block min-w-0 flex-1">
        {/* The name line carries the right-hand item (balance, or the Locked pill), so the subtitle
            below keeps the full text width and stays on one line at 390px. */}
        <span className="flex items-start gap-2">
          <span className="block min-w-0 flex-1 text-[15px] font-semibold leading-5 [overflow-wrap:anywhere]">{trip.name}</span>
          {trip.isCompleted ? (
            <span
              className="flex flex-none items-center gap-1 rounded-full px-[9px] py-1 text-[11px] font-semibold leading-3"
              style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
            >
              <LockIcon size={10} strokeWidth={2.6} />
              Locked
            </span>
          ) : hasBalance ? (
            <span className="hidden flex-none text-right text-[12.5px] leading-5 min-[360px]:block">{balance}</span>
          ) : null}
        </span>
        <span className="block text-[12px] leading-[15px] text-ink/[0.72]">{subtitle}</span>
        {/* Third line: below 360px for every row, and always on a completed row (its name line is
            taken by the Locked pill). */}
        {hasBalance ? (
          <span className={`mt-0.5 block text-[12.5px] leading-[15px] ${trip.isCompleted ? "" : "min-[360px]:hidden"}`}>
            {balance}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export default async function TripsDashboardPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ left?: string }>;
} = {}) {
  const { left } = await searchParams;
  const supabase = await createClient();

  // Tier 1 fix (performance-scaling architecture.md's "/trips — two tiers"): this page's own
  // `getUser()` call and the `trips` select don't depend on each other — `currentUserId` is only
  // consumed below to compute each trip's `yourNetCents`, not to filter the `trips` query itself
  // — so kick both off concurrently instead of waiting for `getUser()` before ever starting the
  // `trips` fetch. The fetched rows are passed into `getMyTrips` so it skips its own (otherwise
  // redundant) `trips` select. `proxy.ts`'s own separate `getUser()` call ahead of this page (ADR
  // 0005) is unchanged — see ADR 0011 for that contingent, not-done-here follow-up.
  const [{ data: { user } }, tripsRowsResult] = await Promise.all([
    supabase.auth.getUser(),
    timeAsync("my-trips", "trips", () => supabase.from("trips").select(TRIP_LIST_COLUMNS).order("created_at", { ascending: false })),
  ]);
  // Defensive fallback only — src/proxy.ts already redirects unauthenticated visitors before
  // this page renders; this isn't a duplicate of that gate (see ADR 0005).
  if (!user) redirect("/");

  let trips: MyTrip[] | null = null;
  let error: string | null = null;
  try {
    if (tripsRowsResult.error) throw tripsRowsResult.error;
    trips = await getMyTrips(supabase, user.id, tripsRowsResult.data ?? []);
  } catch {
    error = "Couldn't load your trips.";
  }

  const ongoingTrips = trips?.filter((trip) => !trip.isCompleted) ?? [];
  const completedTrips = trips?.filter((trip) => trip.isCompleted) ?? [];

  return (
    <Screen glow texture>
      <ScreenContent className="pt-0.5">
        <TopBar
          title={<h1 className="text-display text-[36px] leading-none">Trips</h1>}
          titleClassName=""
          trailing={
            <>
              <IconLinkButton title="Send feedback" className="text-ink/[0.73]" href="/feedback">
                <MessageSquareIcon size={19} strokeWidth={2.2} />
              </IconLinkButton>
            </>
          }
        />
        {left ? (
          <>
            <div className="rounded-chip px-4 py-3 text-[13.5px] font-medium" style={{ background: "var(--color-accent-soft)" }}>
              You left {left}.
            </div>
            <div className="h-3" />
          </>
        ) : null}
        {/* 22px, not the design's 24: with the 40px Feedback button making the top bar taller than
            the 36px title, 22px lands the kicker 62px below the h1 top, as on board A. */}
        <div className="h-[22px]" />

        <TemplateShelf />
        <div className="h-[26px]" />

        {error ? (
          <p className="px-1 text-[13px] text-terracotta">{error}</p>
        ) : !trips || trips.length === 0 ? (
          <>
            <Kicker canvas className="px-1">Your trips</Kicker>
            <div className="h-2.5" />
            <Card className="px-5 py-7 text-center">
              <span className="block text-[15px] font-semibold">No trips yet</span>
              <span className="mt-1.5 block text-[13px] leading-[1.45] text-ink/[0.74]">
                Pick a template above and your list starts with the basics. Your trips will show up here.
              </span>
            </Card>
          </>
        ) : (
          <>
            {ongoingTrips.length > 0 ? (
              <>
                <Kicker canvas className="px-1">
                  Ongoing
                </Kicker>
                <div className="h-2.5" />
                <Card className="px-4 py-1">
                  {ongoingTrips.map((trip, i) => (
                    <TripRow key={trip.id} trip={trip} isLast={i === ongoingTrips.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}
            {completedTrips.length > 0 ? (
              <>
                {ongoingTrips.length > 0 ? <div className="h-[26px]" /> : null}
                <Kicker canvas className="px-1">
                  Completed
                </Kicker>
                <div className="h-2.5" />
                <Card className="px-4 py-1">
                  {completedTrips.map((trip, i) => (
                    <TripRow key={trip.id} trip={trip} isLast={i === completedTrips.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
        <LegalLinks />
        {/* With ScreenContent's pb-10 this leaves about 92px below the legal links, so they clear the fixed pill (56px high, 18px up). */}
        <div aria-hidden className="h-[52px]" />
      </ScreenContent>
      <FabBar>
        <LinkButton href="/trip/new" variant="fab" className="text-[16px]">
          <PlusIcon size={19} strokeWidth={2.6} aria-hidden />
          New trip
        </LinkButton>
      </FabBar>
    </Screen>
  );
}
