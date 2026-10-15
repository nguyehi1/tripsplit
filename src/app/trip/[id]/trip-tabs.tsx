"use client";

import Link from "next/link";
import { useState } from "react";
import { PencilIcon } from "@/components/icons";
import { Avatar, Card, Divider, ProgressBar, TabSwitch } from "@/components/ui";
import { displayNameFor } from "@/lib/avatar";
import { formatCents } from "@/lib/currency";
import { getShoppingListView, type ShoppingListView } from "@/lib/data/shopping-list";
import type { TripView } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";
import { ShoppingListTab } from "./shopping-list-tab";
import { useTripTab } from "./trip-tab-context";

/** Details tab lists at most this many people until the viewer expands it. */
const DETAILS_COLLAPSED_COUNT = 5;

export function TripTabs({
  tripId,
  members,
  expenses,
  you,
  isCompleted,
  shoppingList: initialShoppingList,
  tripTypes = [],
}: {
  tripId: string;
  members: TripView["members"];
  expenses: TripView["expenses"];
  you: TripView["you"];
  isCompleted: boolean;
  /** Server-rendered initial shopping-list view (architecture.md section 4) — kept as local
   *  client state (not just a read-only prop) so claim/unclaim/delete mutations on the List tab
   *  can refresh in place without needing a full page reload. */
  shoppingList: ShoppingListView | null;
  /** The trip's catalog types in pick order, for the Suggested card on the List tab. */
  tripTypes?: readonly string[];
}) {
  const { tab, setTab } = useTripTab();
  const [shoppingList, setShoppingList] = useState(initialShoppingList);
  const [syncedShoppingList, setSyncedShoppingList] = useState(initialShoppingList);
  const [showAllMembers, setShowAllMembers] = useState(false);
  const visibleMembers = showAllMembers ? members : members.slice(0, DETAILS_COLLAPSED_COUNT);
  const hiddenMemberCount = members.length - visibleMembers.length;
  const maxPaidCents = Math.max(1, ...members.map((m) => m.paidCents));

  // The add-item sheet lives on a separate route/component tree with no access to
  // `refreshShoppingList` below (only ShoppingListTab's own claim/unclaim/delete handlers get
  // that callback directly) — it can only trigger a server refresh via `router.refresh()`. Since
  // `shoppingList` is local client state seeded once from `initialShoppingList`, React doesn't
  // re-run the `useState` initializer on a prop change alone, so a freshly server-fetched prop was
  // silently dropped until a full page reload re-mounted this component. React's own "adjust state
  // during render" pattern (not an effect, to avoid an extra render + the lint rule against
  // setState-in-effect) re-syncs whenever the server hands us a genuinely new object.
  if (initialShoppingList !== syncedShoppingList) {
    setSyncedShoppingList(initialShoppingList);
    setShoppingList(initialShoppingList);
  }

  async function refreshShoppingList(): Promise<ShoppingListView | null> {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setShoppingList(null);
        return null;
      }
      const next = await getShoppingListView(supabase, tripId, user.id);
      setShoppingList(next);
      return next;
    } catch {
      setShoppingList(null);
      return null;
    }
  }

  return (
    <>
      <TabSwitch
        value={tab}
        onChange={setTab}
        options={[
          { value: "expenses", label: "Expenses" },
          { value: "details", label: "Details" },
          { value: "list", label: "List" },
        ]}
      />
      <div className="h-3.5" />

      {tab === "expenses" ? (
        expenses.length === 0 ? (
          <div className="px-1">
            <p className="text-[13px] text-ink/60">No expenses logged yet.</p>
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
      ) : tab === "details" ? (
        <Card className="px-[18px] py-4">
          {visibleMembers.map((member, i) => (
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
          {hiddenMemberCount > 0 ? (
            <>
              <div className="h-4" />
              <Divider className="bg-ink/[0.08]" />
              <button
                type="button"
                onClick={() => setShowAllMembers(true)}
                className="mt-3 w-full cursor-pointer text-center text-[13.5px] font-semibold"
                style={{ color: "var(--color-accent-strong)" }}
              >
                +{hiddenMemberCount} more {hiddenMemberCount === 1 ? "person" : "people"} — show all
              </button>
            </>
          ) : null}
        </Card>
      ) : (
        <ShoppingListTab
          tripId={tripId}
          isCompleted={isCompleted}
          shoppingList={shoppingList}
          onRefresh={refreshShoppingList}
          tripTypes={tripTypes}
        />
      )}
    </>
  );
}
