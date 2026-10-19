import type { ReactNode } from "react";
import { LockIcon, MessageSquareIcon, PeopleIcon } from "@/components/icons";
import { TripNavBar } from "@/components/bottom-nav-bar";
import { Wordmark } from "@/components/brand/wordmark";
import {
  AvatarStack,
  BottomBar,
  Card,
  DeadEndScreen,
  Divider,
  IconLinkButton,
  Kicker,
  LinkButton,
  Screen,
  ScreenContent,
  TopBar,
} from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { getShoppingListView, type ShoppingListView } from "@/lib/data/shopping-list";
import { getTripSummary, getTripView, wasRemovedFromTrip, type TripSummary, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { timeAsync } from "@/lib/perf/timing";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { JoinTripInline } from "./join-trip-inline";
import { TripBottomBarButton } from "./trip-bottom-bar-button";
import { TripTabProvider, type TripTab } from "./trip-tab-context";
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
 * "See full details" routes through `joinTripId=<id>` (migration 0016 — see `join_trip_by_id`
 * and `joinTripById`/`getTripSummary`'s doc comments in `src/lib/data/trips.ts`) — `/check-email`'s
 * handleConfirm only calls the join RPC (which actually inserts the `trip_members` row) when
 * `invite`/`joinTripId` is present, so without this a visitor who verified via this bare-link
 * path would become a verified user who was still never added as a member, and land right back
 * here in a permanent loop.
 *
 * `alreadySignedIn` (2026-10-01 follow-up): a visitor who already has a verified, non-anonymous
 * session — the browser's own persisted Supabase session, nothing bespoke — skips the
 * email+OTP detour entirely and gets `JoinTripInline`'s one-field "join" form instead. Surfaced
 * a real bug fixed the same day: without this, such a visitor's only path was through
 * `/check-email`, where an anonymous-session upgrade attempt for an email that already belongs
 * to their own existing account failed outright (Supabase's `email_exists`) — see
 * `src/lib/use-otp-flow.ts`'s `signingIntoExisting` fallback, which fixes that path for someone
 * who still has no session at all (e.g. a different browser/private window) but shouldn't be the
 * primary route for someone this browser already recognizes.
 */
function TripSummaryOnly({
  id,
  summary,
  alreadySignedIn,
}: {
  id: string;
  summary: TripSummary;
  alreadySignedIn: boolean;
}) {
  const { members, settlements, totalCents, avgPerPersonCents } = summary;
  return (
    <Screen glow texture>
      <ScreenContent className="pt-0.5" padding="px-4">
        <div className="flex items-center gap-2 py-3">
          <span className="text-[12.5px] font-semibold text-muted">Trip summary</span>
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
            <span className="ml-2.5 text-[12.5px] text-muted">
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
                <div key={i} className="flex items-baseline justify-between py-[11px]">
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
          {alreadySignedIn ? (
            <>
              <div className="text-[15px] font-semibold">Join this trip?</div>
              <div className="mt-1.5 text-[13px] leading-[1.45] text-muted">
                You&apos;re already signed in — just add your name to see the full list and add
                your own expenses.
              </div>
              <div className="h-3" />
              <JoinTripInline tripId={id} />
            </>
          ) : (
            <>
              <div className="text-[15px] font-semibold">Want the full expense list?</div>
              <div className="mt-1.5 text-[13px] leading-[1.45] text-muted">
                See exactly what was spent and add your own — just confirm your email.
              </div>
              <div className="h-3" />
              <LinkButton
                href={`/check-email?trigger=detail&joinTripId=${encodeURIComponent(id)}&next=${encodeURIComponent(`/trip/${id}`)}&back=${encodeURIComponent(`/trip/${id}`)}`}
                variant="accent"
                block={false}
                className="px-5 text-[14px]"
              >
                See full details
              </LinkButton>
            </>
          )}
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
 * `id` (the trip's own UUID, already in scope at the call site — no RPC needed) backs the rejoin
 * action, via `JoinTripInline` (2026-10-01 follow-up) rather than a link through
 * `/check-email?joinTripId=<id>` (migration 0016's original version of this fix) — this screen's
 * own precondition (`user && user.is_anonymous !== true`, checked by the caller before rendering
 * it) means whoever sees it is *always* already in a verified, non-anonymous session, so sending
 * them through an email+OTP step they've already completed was always redundant, and — per the
 * live bug this surfaced — could outright fail (Supabase's `email_exists` on the anonymous-
 * linking attempt /check-email otherwise forces, if their session had reverted to anonymous
 * somehow). Per design.md section 8 point 3, this still deliberately doesn't display the
 * code/link itself — `JoinTripInline` only takes a display name, never the invite code — so this
 * screen doesn't hand a removed member a fresh, more-convenient way to re-enter than "use the
 * link you already have."
 */
function RemovedFromTripScreen({ id }: { id: string }) {
  return (
    <DeadEndScreen
      icon={<PeopleIcon size={24} strokeWidth={2.2} />}
      title={<>You&apos;re no longer on this trip.</>}
      body={
        <>
          The organizer removed you from this trip. Your past expenses are still part of the
          trip&apos;s record.
        </>
      }
    >
      <div className="h-5" />
      <div className="mx-auto max-w-[260px] text-left">
        <JoinTripInline tripId={id} cta="Rejoin trip" />
      </div>
      <div className="h-2.5" />
      <LinkButton href="/trips" variant="soft" block={false} className="mx-auto px-6">
        Back to my trips
      </LinkButton>
    </DeadEndScreen>
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
      return await timeAsync("trip-dashboard", "getTripSummary", () => getTripSummary(createServiceClient(), id));
    } catch {
      return null;
    }
  }

  const [{ data: { user } }, summary] = await Promise.all([supabase.auth.getUser(), fetchSummary()]);

  if (!summary) {
    return (
      <>
        <Screen glow texture>
          <ScreenContent className="pt-14" padding="px-4">
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
  // shopping-list's List tab is detail-tier, same gate as Expenses/roster (architecture.md
  // section 4) — fetched as one more parallel query alongside getTripView (neither depends on
  // the other's result, only on `user`), then discarded below if `view` itself didn't resolve. A
  // failed shopping-list read degrades to an empty/error list state rather than breaking the
  // whole trip page, same try/catch-to-empty-default pattern as `fetchSummary` above.
  let view: TripView | null = null;
  let shoppingList: ShoppingListView | null = null;
  if (user) {
    const [viewResult, shoppingListResult] = await Promise.all([
      timeAsync("trip-dashboard", "getTripView", () => getTripView(supabase, id, user.id)).catch(() => null),
      timeAsync("trip-dashboard", "getShoppingListView", () => getShoppingListView(supabase, id, user.id)).catch(
        () => null,
      ),
    ]);
    view = viewResult;
    shoppingList = shoppingListResult;
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
          <RemovedFromTripScreen id={id} />
          {sheet}
        </>
      );
    }
    return (
      <>
        <TripSummaryOnly id={id} summary={summary} alreadySignedIn={user != null && user.is_anonymous !== true} />
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

  const initialTab: TripTab = tab === "details" ? "details" : tab === "list" ? "list" : "expenses";

  return (
    <TripVerificationProvider initialIsVerified={isVerified} initialNeedsName={isVerified && you?.displayName === "Organizer"}>
      <TripTabProvider initialTab={initialTab}>
        <Screen glow texture>
          <ScreenContent className="pt-0.5" padding="px-4">
            {/* Splitiful wordmark + Feedback icon, same header as Home (user feedback,
               2026-10-16) — not a back-to-Trips link; the bottom nav bar's "Trips" tab already
               covers that. No "Trip" tag either — it named the obvious and ate space the compact
               board-C card doesn't spend on it; the date/Locked badge carry the row. */}
            <TopBar
              title={<Wordmark width={150} height={42} />}
              titleClassName=""
              trailing={
                <IconLinkButton title="Send feedback" className="text-muted" href="/feedback">
                  <MessageSquareIcon size={19} strokeWidth={2.2} />
                </IconLinkButton>
              }
            />
            <div className="h-4" />
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                {/* 26px, not today's shipped 32px (design.md §4.4 — the 32px is what's being
                   changed by this feature) — wraps rather than truncates on a long name, same
                   `[overflow-wrap:anywhere]` convention as Home's `TripRow`. */}
                <div className="text-display text-[26px] [overflow-wrap:anywhere]">{trip.name}</div>
                {/* Settle up/Invite, moved here from the TopBar's trailing slot (design.md
                   §4.4's board-C layout; architecture.md §2.4's open item, resolved per the
                   default call: a straightforward relocation, same links/icons). */}
                <div className="flex flex-none items-center gap-2">
                  <VerifiedActionIcons tripId={id} />
                </div>
              </div>
              {formatDateRange(trip.startsOn, trip.endsOn) || trip.isCompleted ? (
                <>
                  <div className="h-1" />
                  <div className="flex items-center gap-2">
                    {formatDateRange(trip.startsOn, trip.endsOn) ? (
                      <span className="text-[12.5px] text-muted">{formatDateRange(trip.startsOn, trip.endsOn)}</span>
                    ) : null}
                    {trip.isCompleted ? (
                      <span
                        className="flex items-center gap-1 rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold"
                        style={{ background: "var(--color-terracotta-soft)", color: "var(--color-terracotta)" }}
                      >
                        <LockIcon size={11} strokeWidth={2.6} />
                        Locked
                      </span>
                    ) : null}
                  </div>
                </>
              ) : null}
              <div className="h-2.5" />
              <div className="flex items-center">
                <AvatarStack members={members} />
                <span className="ml-2.5 text-[12.5px] text-muted">
                  {members.length} {members.length === 1 ? "person" : "people"}
                </span>
              </div>
              <div className="h-3" />
              <Divider />
              <div className="h-3" />
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
                  <div className="h-3" />
                  <Divider />
                  <div className="h-3" />
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
            </Card>

            <InlineVerifyWidget />

            <div className="h-7" />

            <TripTabs
              tripId={id}
              members={members}
              expenses={expenses}
              you={you}
              isCompleted={trip.isCompleted}
              shoppingList={shoppingList}
              tripTypes={trip.types}
            />
          </ScreenContent>
          <BottomBar>
            <VerifiedBottomBarContent>
              <TripBottomBarButton tripId={id} isCompleted={trip.isCompleted} />
            </VerifiedBottomBarContent>
          </BottomBar>
          {/* The unified nav bar sits below the existing CTA capsule (architecture.md §2.1's
             "stacking with the existing CTA slot") — both already sticky/fixed, so this is a
             stacking-order addition, not a rewrite of `BottomBar`. */}
          <TripNavBar tripId={id} />
        </Screen>
        {sheet}
      </TripTabProvider>
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
