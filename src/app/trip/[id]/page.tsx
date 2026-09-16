import { redirect } from "next/navigation";
import {
  ArrowsLeftRightIcon,
  ChevronLeftIcon,
  LockIcon,
  MessageSquareIcon,
  PeopleIcon,
  PlusIcon,
} from "@/components/icons";
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
} from "@/components/ui";
import { formatCents } from "@/lib/currency";
import { getTripView, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { TripTabs } from "./trip-tabs";

export default async function TripDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defensive fallback only — src/proxy.ts already redirects unauthenticated visitors before
  // this page renders. This just covers the session becoming invalid between that check and
  // this render; it must not be read as re-deriving proxy.ts's redirect (see ADR 0005).
  if (!user) redirect("/");

  let view: TripView | null = null;
  try {
    view = await getTripView(supabase, id, user.id);
  } catch {
    // Collapses "not a trip member" (RLS filters the row) and any other failure into one
    // inline message on purpose, matching pre-SSR behavior byte-for-byte — not notFound()
    // and not a thrown error into error.tsx. See ADR 0005 point 3 and design.md section 3.
    view = null;
  }

  if (!view) {
    return (
      <Screen>
        <ScreenContent className="pt-14">
          <p className="text-[15px] text-ink/70">Couldn&apos;t load this trip — you may not be on it.</p>
        </ScreenContent>
      </Screen>
    );
  }

  const { trip, members, expenses, totalCents, avgPerPersonCents, you } = view;

  return (
    <Screen>
      <ScreenContent className="pt-0.5">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <IconLinkButton title="All trips" className="text-ink/[0.73]" href="/trips">
              <ChevronLeftIcon size={18} strokeWidth={2.3} />
            </IconLinkButton>
            <span className="text-[12.5px] font-semibold text-ink/[0.72]">Your trip</span>
          </div>
          <div className="flex gap-2">
            <IconLinkButton title="New trip" className="text-ink/[0.73]" href="/trip/new">
              <PlusIcon size={19} strokeWidth={2.4} />
            </IconLinkButton>
            <IconLinkButton title="Trip roster" className="text-ink/[0.73]" href={`/trip/${id}/invite`}>
              <PeopleIcon size={19} strokeWidth={2.2} />
            </IconLinkButton>
            <IconLinkButton
              title="Settle up"
              style={{ background: "oklch(0.95 0.04 88)", color: "oklch(0.36 0.08 80)" }}
              href={`/trip/${id}/settle-up`}
            >
              <ArrowsLeftRightIcon size={19} strokeWidth={2.2} />
            </IconLinkButton>
            <IconLinkButton title="Send feedback" className="text-ink/[0.73]" href={`/trip/${id}/feedback`}>
              <MessageSquareIcon size={19} strokeWidth={2.2} />
            </IconLinkButton>
          </div>
        </div>

        <Card className="p-[18px]">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-[11px] py-[5px] text-[11.5px] font-semibold"
              style={{ background: "oklch(0.95 0.04 88)", color: "oklch(0.38 0.08 80)" }}
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
        <div className="h-3.5" />

        <TripTabs tripId={id} members={members} expenses={expenses} you={you} isCompleted={trip.isCompleted} />
      </ScreenContent>
      <BottomBar>
        {trip.isCompleted ? (
          <Button variant="muted" className="h-[54px] text-[15.5px]">
            <LockIcon size={17} strokeWidth={2.4} />
            Trip is locked — no more expenses
          </Button>
        ) : (
          <LinkButton href={`/trip/${id}/add-expense`} variant="primary" className="h-[54px] text-[15.5px]">
            <PlusIcon size={19} strokeWidth={2.6} />
            Add an expense
          </LinkButton>
        )}
      </BottomBar>
    </Screen>
  );
}
