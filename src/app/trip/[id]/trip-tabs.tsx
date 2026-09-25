"use client";

import Link from "next/link";
import { useState } from "react";
import { PencilIcon } from "@/components/icons";
import { Avatar, Card, Divider, ProgressBar, TabSwitch } from "@/components/ui";
import { displayNameFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import type { TripView } from "@/lib/data/trips";

export function TripTabs({
  tripId,
  members,
  expenses,
  you,
  isCompleted,
  defaultTab = "expenses",
}: {
  tripId: string;
  members: TripView["members"];
  expenses: TripView["expenses"];
  you: TripView["you"];
  isCompleted: boolean;
  /**
   * Defaults to "expenses" to match the parent Server Component's implicit first paint — a
   * caller passing "details" (e.g. an invitee landing here right after verifying from the
   * "See full details" trigger, design.md section 6.1) must derive it the same way server-side
   * so the client's first render matches, avoiding a hydration mismatch.
   */
  defaultTab?: "expenses" | "details";
}) {
  const [tab, setTab] = useState<"expenses" | "details">(defaultTab);
  const maxPaidCents = Math.max(1, ...members.map((m) => m.paidCents));

  return (
    <>
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
          <div className="flex items-center gap-2.5 px-1">
            {/* Miso cameo (AC13) — empty-state only (design.md section 4). Once a trip has real
             *  expenses this whole row (and Miso with it) disappears. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- no next/image config for
               public/images/* yet (architecture.md); a plain <img> is fine for this pass. */}
            <img
              src="/images/miso_01.jpg"
              alt=""
              width={24}
              height={24}
              className="block size-6 flex-none shadow-card-sm"
            />
            <p className="text-[13px] text-ink/60">No expenses logged yet — Miso&apos;s ready when you are.</p>
          </div>
        ) : (
          <Card className="px-4 py-1">
            {expenses.map((expense, i) => {
              const editable = expense.payer.id === you?.id && !isCompleted;
              const rowClassName = `flex items-center gap-3 py-[13px] ${
                i < expenses.length - 1 ? "border-b border-ink/[0.07]" : ""
              } ${editable ? "cursor-pointer" : ""}`;
              const children = (
                <>
                  <Avatar initials={expense.payer.initials} color={expense.payer.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{expense.description}</div>
                    <div className="mt-px text-[12px] text-ink/[0.72]">
                      {/* A former member's expenses render with a muted, non-roster identity
                       * (`isRemoved`) instead of their real name — see ADR 0012. */}
                      {expense.payer.isRemoved
                        ? expense.payer.displayName
                        : displayNameFor(expense.payer.displayName, expense.payer.isPlaceholder)}{" "}
                      · {expense.day}
                    </div>
                  </div>
                  <div className="text-display text-[17px]">{formatCents(expense.amountCents)}</div>
                  {editable ? <PencilIcon size={14} strokeWidth={2.2} className="text-ink/40" /> : null}
                </>
              );
              // A real <a> here (vs. the old div[role=button]) activates on Enter but not
              // Space — a deliberate, documented accessibility delta, not an oversight
              // (see ADR 0005 point 2).
              return editable ? (
                <Link
                  key={expense.id}
                  href={`/trip/${tripId}/expense/${expense.id}/edit`}
                  aria-label={`Edit ${expense.description}, ${formatCents(expense.amountCents)}`}
                  className={rowClassName}
                >
                  {children}
                </Link>
              ) : (
                <div key={expense.id} className={rowClassName}>
                  {children}
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
                  style={{ color: member.netCents >= 0 ? "var(--color-accent-deep)" : "inherit" }}
                >
                  {formatCents(member.paidCents)}
                </div>
              </div>
              <div className="h-2.5" />
              <ProgressBar
                percent={(member.paidCents / maxPaidCents) * 100}
                color={member.netCents >= 0 ? "var(--color-balance-positive)" : "var(--color-balance-negative)"}
              />
              <div className="h-2" />
              <span
                className="text-[12px] font-semibold"
                style={{
                  color:
                    member.netCents >= 0
                      ? "var(--color-accent-deep)"
                      : "color-mix(in srgb, var(--color-ink) 73%, transparent)",
                }}
              >
                {member.netCents >= 0
                  ? `Up ${formatCents(member.netCents)} on their share`
                  : `Down ${formatCents(-member.netCents)}`}
              </span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
