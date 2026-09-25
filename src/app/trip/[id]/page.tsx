import type { ReactNode } from "react";
import { ChevronLeftIcon, LockIcon, MessageSquareIcon, PeopleIcon, PlusIcon } from "@/components/icons";
import {
  AvatarStack,
  BottomBar,
  Button,
  Card,
  Divider,
  IconLinkButton,
  Kicker,
  LinkButton,
  Screen,
  ScreenContent,
  TopBar,
} from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { getTripSummary, getTripView, wasRemovedFromTrip, type TripSummary, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { timeAsync } from "@/lib/perf/timing";
import { createClient } from "@/lib/supabase/server";
import { TripTabs } from "./trip-tabs";
import { InlineVerifyWidget, TripVerificationProvider, VerifiedActionIcons, VerifiedBottomBarContent } from "./verify-inline";

/**
 * Summary-tier render (design.md section 5's shape, adapted): shown to a visitor who can read
 * this trip's public aggregates (via `get_trip_summary`, no session required) but not its
 * detail (a non-owner, unverified caller — `getTripView` came back empty/errored). Note: since
 * `get_trip_summary` deliberately returns balances only (no trip name/dates — see
 * architecture.md's "Data model changes"), and `trips`' own select policy still requires
 * ownership/membership, this render can't show the trip's name/dates the way `/join/[code]`'s
 * dedicated summary screen can (that screen has them via the separate, invite-code-keyed
 * `get_trip_by_invite_code` RPC). A bare `/trip/[id]` link is a secondary entry point relative
 * to the invite link.
 *
 * "See full details" routes through `invite=<summary.inviteCode>` (migration 0012, pre-push
 * review fix), the same mechanism `/join/[code]` uses — `/check-email`'s handleConfirm only
 * calls `/api/join` (which actually inserts the `trip_members` row) when `invite` is present, so
 * without this a visitor who verified via this bare-link path would become a verified user who
 * was still never added as a member, and land right back here in a permanent loop.
 */
function TripSummaryOnly({ id, summary }: { id: string; summary: TripSummary }) {
  const { members, settlements, totalCents, avgPerPersonCents, inviteCode } = summary;
  return (
    <Screen glow texture>
      <ScreenContent className="pt-0.5">
        <div className="flex items-center gap-2 py-3">
          <span className="text-[12.5px] font-semibold text-ink/[0.72]">Trip summary</span>
        </div>
        <Card className="p-[18px]">
          <div className="flex items-center">
            <AvatarStack
              members={members.map((m) => ({
                id: m.id,
                initials: m.displayName.slice(0, 2).toUpperCase(),
                avatar: { bg: "var(--color-avatar-placeholder)", fg: "var(--color-ink)" },
              }))}
            />
            <span className="ml-2.5 text-[12.5px] text-ink/[0.72]">
              {members.length} {members.length === 1 ? "person" : "people"}
            </span>
          </div>
          <div className="h-4" />
          <Divider />
          <div className="h-4" />
          <div className="flex">
            <div className="flex-1">
              <Kicker>Total so far</Kicker>
              <div className="text-display mt-1 text-[28px]">{formatCents(totalCents)}</div>
            </div>
            <div className="mx-4 w-px bg-ink/10" />
            <div className="flex-1 text-right">
              <Kicker>Avg / person</Kicker>
              <div className="text-display mt-1 text-[28px]">{formatCents(avgPerPersonCents)}</div>
            </div>
          </div>
          {settlements.length > 0 ? (
            <>
              <div className="h-4" />
              <Divider />
              <div className="h-4" />
              <Kicker>Who owes who</Kicker>
              <div className="h-2" />
              {settlements.map((s, i) => (
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
        <div className="rounded-chip p-4" style={{ background: "var(--color-accent-soft)" }}>
          <div className="text-[15px] font-semibold">Want the full expense list?</div>
          <div className="mt-1.5 text-[13px] leading-[1.45] text-ink/[0.72]">
            See exactly what was spent and add your own — just confirm your email.
          </div>
          <div className="h-3" />
          <LinkButton
            href={`/check-email?trigger=detail&invite=${encodeURIComponent(inviteCode)}&next=${encodeURIComponent(`/trip/${id}`)}&back=${encodeURIComponent(`/trip/${id}`)}`}
            variant="accent"
            block={false}
            className="px-5 text-[14px]"
          >
            See full details
          </LinkButton>
        </div>
      </ScreenContent>
    </Screen>
  );
}

/**
 * Shown to a returning visitor who is no longer a `trip_members` row on this trip but is
 * detected (via `wasRemovedFromTrip`, ADR 0012) to have previously participated — i.e. was
 * removed by the organizer, or left themselves and is returning via a stale tab/bookmark/link
 * rather than the immediate post-leave redirect (which already shows its own "You left [Trip
 * Name]." banner on `/trips`, see `src/app/trips/page.tsx`). Deliberately distinct from
 * `TripSummaryOnly` (the public view a stranger with the link sees) and from the generic
 * "Couldn't load this trip" fallback — this is the in-app notification requirements.md's
 * AC4/AC12 require.
 *
 * Design.md's copy table distinguishes a "removed" vs. "left" body string, but — per ADR 0012 —
 * `wasRemovedFromTrip` is a single boolean reconstructed from `expenses`, with no way to tell
 * organizer-removal apart from a stale-tab self-leave. Since the self-leave case is already
 * covered immediately (the actor's own redirect + banner, no detection needed), this screen uses
 * the "removed" phrasing unconditionally — the one case this RPC signal is actually meant to
 * cover. It also can't name the trip: `getTripSummary` (the only data available once `getTripView`
 * has returned null) never returns the trip name (see `TripSummaryOnly`'s comment above), so the
 * copy says "this trip" rather than quoting a name it doesn't have.
 *
 * `inviteCode` (from the same `summary` this replaces — `getTripSummary` returns it regardless of
 * current membership, see its own doc comment) backs the "Rejoin with the invite link" action —
 * per design.md section 8 point 3, this deliberately doesn't display the code/link itself, only
 * links through it, so this screen doesn't hand a removed member a fresh, more-convenient way to
 * re-enter than "use the link you already have."
 */
function RemovedFromTripScreen({ inviteCode }: { inviteCode: string }) {
  return (
    <Screen glow texture>
      <ScreenContent className="pt-14 text-center">
        <div
          className="mx-auto flex size-[52px] items-center justify-center rounded-full"
          style={{ background: "var(--color-avatar-placeholder)", color: "var(--color-ink)" }}
        >
          <PeopleIcon size={24} strokeWidth={2.2} />
        </div>
        <div className="h-4" />
        <h1 className="text-display text-[24px]">You&apos;re no longer on this trip.</h1>
        <div className="h-2.5" />
        <p className="mx-auto max-w-[300px] text-[14px] leading-[1.5] text-ink/[0.73]">
          The organizer removed you from this trip. Your past expenses are still part of the
          trip&apos;s record.
        </p>
        <div className="h-5" />
        <LinkButton href={`/join/${inviteCode}`} variant="accent" block={false} className="mx-auto px-6">
          Rejoin with the invite link
        </LinkButton>
        <div className="h-2.5" />
        <LinkButton href="/trips" variant="soft" block={false} className="mx-auto px-6">
          Back to my trips
        </LinkButton>
      </ScreenContent>
    </Screen>
  );
}

/**
 * The trip dashboard's actual render logic (ADR 0008 point 4) — extracted from the default
 * export below so `add-expense/page.tsx` (the hard-nav/deep-link fallback for the add-expense
 * sheet, AC8) can reuse the exact same tiered-fetch/hide-and-reveal behavior with its `sheet`
 * slot populated, instead of duplicating this Server Component's logic. `sheet` is rendered
 * alongside every branch's output (not just the full-detail one) so a direct hit on
 * `/trip/[id]/add-expense` still shows a working, non-blank trip view under the sheet even for a
 * summary-only or not-found caller (AC8) — `AddExpenseSheetContent` does its own independent
 * client-side gating regardless of which tier the caller could see.
 */
export async function renderTripDashboard(
  id: string,
  { tab, sheet = null }: { tab?: string; sheet?: ReactNode } = {},
) {
  const supabase = await createClient();

  // Fetches the public, zero-auth summary tier (works with or without a session — see
  // docs/features/simplified-onboarding/architecture.md's "Route/page changes") alongside
  // `getUser()` below, rather than after it (performance-scaling architecture.md's "/trip/[id] —
  // parallelize getTripSummary/getTripView"): neither call depends on the other's *result* —
  // `getTripSummary` never uses `user`, and the decision to call `getTripView` only needs
  // `user.id`, not `summary` — so running them concurrently collapses three sequential round
  // trips to two with zero visible change (same atomic "nothing, then everything" render as
  // before). If this 404s/empties (bad id), there's nothing to show at all.
  async function fetchSummary(): Promise<TripSummary | null> {
    try {
      return await timeAsync("trip-dashboard", "getTripSummary", () => getTripSummary(supabase, id));
    } catch {
      return null;
    }
  }

  const [{ data: { user } }, summary] = await Promise.all([supabase.auth.getUser(), fetchSummary()]);

  if (!summary) {
    return (
      <>
        <Screen glow texture>
          <ScreenContent className="pt-14">
            <p className="text-[15px] text-ink/70">Couldn&apos;t load this trip — you may not be on it.</p>
          </ScreenContent>
        </Screen>
        {sheet}
      </>
    );
  }

  // Detail tier: only attempted when some session exists (anonymous or permanent). Its result
  // is null when RLS filters it out (a non-owner, unverified caller) — the same failure mode
  // this page always handled, just no longer collapsed into "couldn't load" now that there's a
  // summary tier underneath it to fall back to.
  let view: TripView | null = null;
  if (user) {
    try {
      view = await timeAsync("trip-dashboard", "getTripView", () => getTripView(supabase, id, user.id));
    } catch {
      view = null;
    }
  }

  if (!view) {
    // ADR 0012 / requirements AC4, AC12: a verified, non-anonymous caller who isn't a current
    // member but previously participated (has a paid_by expense here) was removed or left — show
    // the explicit in-app notification instead of falling back to the public summary a stranger
    // would see. Anonymous/no-session callers (and anyone who never logged an expense here, the
    // disclosed gap) fall through to the existing `TripSummaryOnly` behavior, unchanged.
    let removed = false;
    if (user && user.is_anonymous !== true) {
      try {
        removed = await wasRemovedFromTrip(supabase, id);
      } catch {
        removed = false;
      }
    }
    if (removed) {
      return (
        <>
          <RemovedFromTripScreen inviteCode={summary.inviteCode} />
          {sheet}
        </>
      );
    }
    return (
      <>
        <TripSummaryOnly id={id} summary={summary} />
        {sheet}
      </>
    );
  }

  const { trip, members, expenses, totalCents, avgPerPersonCents, you } = view;

  // Hide-until-verified + inline OTP for the organizer's own trip (Decisions 12–13; see
  // docs/features/simplified-onboarding/design.md section 4). `getTripView` only ever resolves
  // here for the trip's owner or a verified member (per the three-tier RLS model), so
  // `user.is_anonymous === true` unambiguously means "this is the pre-verification owner viewing
  // their own trip" — no extra query needed to decide buttons-vs-CTA.
  const isVerified = user != null && user.is_anonymous !== true;

  return (
    <TripVerificationProvider initialIsVerified={isVerified}>
      <Screen glow texture>
        <ScreenContent className="pt-0.5">
          <TopBar
            sticky
            titleClassName="text-[12.5px] font-semibold text-ink/[0.72]"
            title="Your trip"
            leading={
              <IconLinkButton title="All trips" className="text-ink/[0.73]" href="/trips">
                <ChevronLeftIcon size={18} strokeWidth={2.3} />
              </IconLinkButton>
            }
            trailing={
              <>
                <IconLinkButton title="New trip" className="text-ink/[0.73]" href="/trip/new">
                  <PlusIcon size={19} strokeWidth={2.4} />
                </IconLinkButton>
                <VerifiedActionIcons tripId={id} />
                <IconLinkButton title="Send feedback" className="text-ink/[0.73]" href={`/trip/${id}/feedback`}>
                  <MessageSquareIcon size={19} strokeWidth={2.2} />
                </IconLinkButton>
              </>
            }
          />

          <Card className="p-[18px]">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-deep)" }}
              >
                Trip
              </span>
              {trip.isCompleted ? (
                <span
                  className="flex items-center gap-1 rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold"
                  style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
                >
                  <LockIcon size={11} strokeWidth={2.6} />
                  Locked
                </span>
              ) : null}
              {formatDateRange(trip.startsOn, trip.endsOn) ? (
                <span className="text-[12.5px] text-ink/[0.72]">
                  {formatDateRange(trip.startsOn, trip.endsOn)}
                </span>
              ) : null}
            </div>
            <div className="h-3" />
            <div className="text-display text-[32px]">{trip.name}</div>
            <div className="h-3.5" />
            <div className="flex items-center">
              <AvatarStack members={members} />
              <span className="ml-2.5 text-[12.5px] text-ink/[0.72]">
                {members.length} {members.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="h-4" />
            <Divider />
            <div className="h-4" />
            <div className="flex">
              <div className="flex-1">
                <Kicker>Total so far</Kicker>
                <div className="text-display mt-1 text-[28px]">{formatCents(totalCents)}</div>
              </div>
              <div className="mx-4 w-px bg-ink/10" />
              <div className="flex-1 text-right">
                <Kicker>Avg / person</Kicker>
                <div className="text-display mt-1 text-[28px]">{formatCents(avgPerPersonCents)}</div>
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
                <div className="h-3" />
                <div className="flex items-baseline justify-between">
                  <Kicker>You&apos;d owe</Kicker>
                  <div className="text-display text-[16px]" style={{ color: "var(--color-terracotta)" }}>
                    {formatCents(Math.max(0, -you.netCents))}
                  </div>
                </div>
              </>
            ) : null}
          </Card>

          <InlineVerifyWidget />

          <div className="h-3.5" />

          <TripTabs
            tripId={id}
            members={members}
            expenses={expenses}
            you={you}
            isCompleted={trip.isCompleted}
            defaultTab={tab === "details" ? "details" : "expenses"}
          />
        </ScreenContent>
        <BottomBar>
          <VerifiedBottomBarContent>
            {trip.isCompleted ? (
              <Button variant="capsuleMuted" className="h-[54px] text-[15.5px]">
                <LockIcon size={17} strokeWidth={2.4} />
                Trip is locked — no more expenses
              </Button>
            ) : (
              <LinkButton href={`/trip/${id}/add-expense`} variant="capsule" className="h-[54px] text-[15.5px]">
                <PlusIcon size={19} strokeWidth={2.6} />
                Add an expense
              </LinkButton>
            )}
          </VerifiedBottomBarContent>
        </BottomBar>
      </Screen>
      {sheet}
    </TripVerificationProvider>
  );
}

export default async function TripDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  return renderTripDashboard(id, { tab });
}
