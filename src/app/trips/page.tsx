import Link from "next/link";
import { createElement } from "react";
import { redirect } from "next/navigation";
import { LockIcon, MapPinIcon, MessageSquareIcon } from "@/components/icons";
import { HomeNavBar } from "@/components/bottom-nav-bar";
import { DogFace } from "@/components/brand/dog-face";
import { Wordmark } from "@/components/brand/wordmark";
import { TemplateShelf } from "@/components/template-shelf";
import { iconForTripType } from "@/components/trip-type-icons";
import { Card, IconLinkButton, Kicker, Screen, ScreenContent, TopBar } from "@/components/ui";
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
  if (netCents === 0) return <span className="text-[12.5px] leading-[15px] text-muted">Settled up</span>;
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
 * ("date · people · items to get", parts skipped when absent), the balance at the right end of the
 * name line, or the Locked pill there on a completed trip. Below 360px the balance is a third
 * line instead — except on a locked (completed) trip, which never shows a balance anywhere (user
 * feedback, 2026-10-16: a locked trip is settled by definition, so "You owe"/"You're owed" there
 * reads as stale, not current). The divider is drawn by the caller on every row but the last.
 */
function TripRow({ trip, isLast }: { trip: MyTrip; isLast: boolean }) {
  const icon = trip.types[0] ? iconForTripType(trip.types[0]) : MapPinIcon;
  const subtitleParts = [
    formatDateRangeCompact(trip.startsOn, trip.endsOn),
    `${trip.members.length} ${trip.members.length === 1 ? "person" : "people"}`,
    `${trip.itemsToGetCount} ${trip.itemsToGetCount === 1 ? "item" : "items"} to get`,
  ].filter(Boolean);
  const balance = <BalanceLabel netCents={trip.yourNetCents} hasExpenses={trip.totalCents > 0} />;
  // Locked trips never show a balance (see the function comment) — only an active trip with
  // expenses does.
  const hasBalance = trip.totalCents > 0 && !trip.isCompleted;
  return (
    <Link
      href={`/trip/${trip.id}`}
      className={`flex w-full cursor-pointer items-center gap-3 py-[11px] text-left ${isLast ? "" : "border-b border-hairline-strong"}`}
    >
      <span
        aria-hidden="true"
        className={`flex size-10 flex-none items-center justify-center rounded-[14px] ${
          trip.isCompleted ? "bg-tint text-muted" : ""
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
        <span className="block text-[12px] leading-[15px] text-muted">
          {subtitleParts.map((part, i) => (
            <span key={i}>
              {i > 0 ? <span className="mx-1.5 text-faint">·</span> : null}
              {part}
            </span>
          ))}
        </span>
        {/* Third line: below 360px, only on an active (not locked) row with expenses. */}
        {hasBalance ? (
          <span className="mt-0.5 block text-[12.5px] leading-[15px] min-[360px]:hidden">{balance}</span>
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
      <ScreenContent className="pt-0.5" padding="px-4">
        <TopBar
          title={<Wordmark width={150} height={42} />}
          titleClassName=""
          trailing={
            <>
              <IconLinkButton title="Send feedback" className="text-muted" href="/feedback">
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
          // Home first-run (board L, AC10): no Ongoing/Completed sections render at all — not
          // "render but empty." Badge size/structure corrected, 2026-10-16, from the user's
          // pasted canvas export: a ~167px white outer card containing a ~149px cream inner
          // square containing the dog image alone (no wordmark inside the card — the page's own
          // title above already carries the wordmark). Replaces the earlier small `BrandRow`
          // tile, which was far smaller than the actual design. Copy kept verbatim from the
          // handoff, not paraphrased.
          <Card className="flex flex-col items-center px-5 py-7 text-center">
            <span
              aria-hidden
              className="flex items-center justify-center rounded-[28px] bg-card shadow-card"
              style={{ width: 167, height: 167 }}
            >
              <span
                className="flex items-center justify-center rounded-[20px]"
                style={{ width: 149, height: 149, background: "var(--color-logo-plate)" }}
              >
                <DogFace width={135} height={103} />
              </span>
            </span>
            <div className="h-3" />
            <span className="block text-[15px] font-semibold">No trips yet</span>
            <span className="mt-1.5 block text-[13px] leading-[1.45] text-muted">
              Splitiful is ready when you are. Pick a template above, or start a blank trip.
            </span>
          </Card>
        ) : (
          <>
            {ongoingTrips.length > 0 ? (
              <>
                <Kicker canvas className="px-1">
                  Ongoing ({ongoingTrips.length})
                </Kicker>
                <div className="h-[14px]" />
                <Card className="px-4 py-[3px]">
                  {ongoingTrips.map((trip, i) => (
                    <TripRow key={trip.id} trip={trip} isLast={i === ongoingTrips.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}
            {completedTrips.length > 0 ? (
              <>
                {ongoingTrips.length > 0 ? <div className="h-[36px]" /> : null}
                <Kicker canvas className="px-1">
                  Completed ({completedTrips.length})
                </Kicker>
                <div className="h-[14px]" />
                <Card className="px-4 py-[3px]">
                  {completedTrips.map((trip, i) => (
                    <TripRow key={trip.id} trip={trip} isLast={i === completedTrips.length - 1} />
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
        {/* With ScreenContent's pb-10 this leaves clearance above the fixed HomeNavBar. */}
        <div aria-hidden className="h-[72px]" />
      </ScreenContent>
      <HomeNavBar />
    </Screen>
  );
}
