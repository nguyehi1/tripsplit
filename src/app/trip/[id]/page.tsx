"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowsLeftRightIcon,
  ChevronLeftIcon,
  LockIcon,
  MessageSquareIcon,
  PencilIcon,
  PeopleIcon,
  PlusIcon,
} from "@/components/icons";
import {
  AvatarStack,
  Avatar,
  BottomBar,
  Button,
  Card,
  Divider,
  IconButton,
  Kicker,
  ProgressBar,
  Screen,
  ScreenContent,
  TabSwitch,
} from "@/components/ui";
import { displayNameFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import { getTripView, type TripView } from "@/lib/data/trips";
import { formatDateRange } from "@/lib/dates";
import { createClient } from "@/lib/supabase/client";

export default function TripDashboardPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<"expenses" | "details">("expenses");
  const [view, setView] = useState<TripView | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? "Couldn't load this trip — you may not be on it."
              : "Couldn't load this trip.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

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
          <p className="text-[15px] text-ink/70">Loading your trip…</p>
        </ScreenContent>
      </Screen>
    );
  }

  const { trip, members, expenses, totalCents, avgPerPersonCents, you } = view;
  const maxPaidCents = Math.max(1, ...members.map((m) => m.paidCents));

  return (
    <Screen>
      <ScreenContent className="pt-0.5">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-2">
            <IconButton
              title="All trips"
              className="text-ink/[0.73]"
              onClick={() => router.push("/trips")}
            >
              <ChevronLeftIcon size={18} strokeWidth={2.3} />
            </IconButton>
            <span className="text-[12.5px] font-semibold text-ink/[0.72]">Your trip</span>
          </div>
          <div className="flex gap-2">
            <IconButton
              title="New trip"
              className="text-ink/[0.73]"
              onClick={() => router.push("/trip/new")}
            >
              <PlusIcon size={19} strokeWidth={2.4} />
            </IconButton>
            <IconButton
              title="Trip roster"
              className="text-ink/[0.73]"
              onClick={() => router.push(`/trip/${id}/invite`)}
            >
              <PeopleIcon size={19} strokeWidth={2.2} />
            </IconButton>
            <IconButton
              title="Settle up"
              style={{ background: "oklch(0.95 0.04 88)", color: "oklch(0.36 0.08 80)" }}
              onClick={() => router.push(`/trip/${id}/settle-up`)}
            >
              <ArrowsLeftRightIcon size={19} strokeWidth={2.2} />
            </IconButton>
            <IconButton
              title="Send feedback"
              className="text-ink/[0.73]"
              onClick={() => router.push(`/trip/${id}/feedback`)}
            >
              <MessageSquareIcon size={19} strokeWidth={2.2} />
            </IconButton>
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

        <TabSwitch
          value={tab}
          onChange={setTab}
          options={[
            { value: "expenses", label: "Expenses" },
            { value: "details", label: "Details" },
          ]}
        />
        <div className="h-3.5" />

        {tab === "expenses" ? (
          expenses.length === 0 ? (
            <p className="px-1 text-[13px] text-ink/60">No expenses logged yet.</p>
          ) : (
            <Card className="px-4 py-1">
              {expenses.map((expense, i) => {
                const editable = expense.payer.id === you?.id && !trip.isCompleted;
                return (
                  <div
                    key={expense.id}
                    className={`flex items-center gap-3 py-[13px] ${
                      i < expenses.length - 1 ? "border-b border-ink/[0.07]" : ""
                    } ${editable ? "cursor-pointer" : ""}`}
                    role={editable ? "button" : undefined}
                    tabIndex={editable ? 0 : undefined}
                    aria-label={editable ? `Edit ${expense.description}, ${formatCents(expense.amountCents)}` : undefined}
                    onClick={
                      editable ? () => router.push(`/trip/${id}/expense/${expense.id}/edit`) : undefined
                    }
                    onKeyDown={
                      editable
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/trip/${id}/expense/${expense.id}/edit`);
                            }
                          }
                        : undefined
                    }
                  >
                    <Avatar initials={expense.payer.initials} color={expense.payer.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold">{expense.description}</div>
                      <div className="mt-px text-[12px] text-ink/[0.72]">
                        {displayNameFor(expense.payer.displayName, expense.payer.isPlaceholder)} · {expense.day}
                      </div>
                    </div>
                    <div className="text-display text-[17px]">{formatCents(expense.amountCents)}</div>
                    {editable ? <PencilIcon size={14} strokeWidth={2.2} className="text-ink/40" /> : null}
                  </div>
                );
              })}
            </Card>
          )
        ) : (
          <Card className="px-[18px] py-4">
            {members.map((member, i) => (
              <div key={member.id}>
                {i > 0 ? (
                  <>
                    <div className="h-4" />
                    <Divider className="bg-ink/[0.08]" />
                    <div className="h-4" />
                  </>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <div className="text-display text-[24px]">
                    {displayNameFor(member.displayName, member.isPlaceholder)}
                  </div>
                  <div
                    className="text-display text-[24px]"
                    style={{ color: member.netCents >= 0 ? "oklch(0.38 0.08 80)" : "inherit" }}
                  >
                    {formatCents(member.paidCents)}
                  </div>
                </div>
                <div className="h-2.5" />
                <ProgressBar
                  percent={(member.paidCents / maxPaidCents) * 100}
                  color={member.netCents >= 0 ? "oklch(0.68 0.12 85)" : "oklch(0.7 0.1 44)"}
                />
                <div className="h-2" />
                <span
                  className="text-[12px] font-semibold"
                  style={{ color: member.netCents >= 0 ? "oklch(0.38 0.08 80)" : "rgba(35,28,18,0.73)" }}
                >
                  {member.netCents >= 0
                    ? `Up ${formatCents(member.netCents)} on their share`
                    : `Down ${formatCents(-member.netCents)}`}
                </span>
              </div>
            ))}
          </Card>
        )}
      </ScreenContent>
      <BottomBar>
        {trip.isCompleted ? (
          <Button variant="muted" className="h-[54px] text-[15.5px]">
            <LockIcon size={17} strokeWidth={2.4} />
            Trip is locked — no more expenses
          </Button>
        ) : (
          <Button
            variant="primary"
            className="h-[54px] text-[15.5px]"
            onClick={() => router.push(`/trip/${id}/add-expense`)}
          >
            <PlusIcon size={19} strokeWidth={2.6} />
            Add an expense
          </Button>
        )}
      </BottomBar>
    </Screen>
  );
}
