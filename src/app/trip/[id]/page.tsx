import type { ReactNode } from "react";
import { ChevronLeftIcon, LockIcon, MessageSquareIcon, PlusIcon } from "@/components/icons";
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
import { getTripSummary, getTripView, type TripSummary, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Always fetch the public, zero-auth summary tier first (works with or without a session —
  // see docs/features/simplified-onboarding/architecture.md's "Route/page changes"). If this
  // 404s/empties (bad id), there's nothing to show at all.
  let summary: TripSummary | null = null;
  try {
    summary = await getTripSummary(supabase, id);
  } catch {
    summary = null;
  }

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
      view = await getTripView(supabase, id, user.id);
    } catch {
      view = null;
    }
  }

  if (!view) {
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
