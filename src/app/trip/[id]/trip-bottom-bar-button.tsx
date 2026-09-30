"use client";

import { LockIcon, PlusIcon } from "@/components/icons";
import { Button, LinkButton } from "@/components/ui";
import { LOCKED_TRIP_COPY } from "@/lib/locked-trip-copy";
import { useTripTab } from "./trip-tab-context";

/**
 * The one FAB slot, contextual by tab (design.md section 1) — rendered inside `page.tsx`'s
 * existing `BottomBar`/`VerifiedBottomBarContent` wrapping, unchanged. Reads the active tab from
 * `TripTabProvider` (a sibling-tree context, since `BottomBar` isn't a descendant of `TripTabs`)
 * rather than owning any state itself.
 */
export function TripBottomBarButton({ tripId, isCompleted }: { tripId: string; isCompleted: boolean }) {
  const { tab } = useTripTab();

  if (tab === "list") {
    if (isCompleted) {
      return (
        <Button variant="capsuleMuted" className="h-[54px] text-[15.5px]">
          <LockIcon size={17} strokeWidth={2.4} />
          {LOCKED_TRIP_COPY.items.short}
        </Button>
      );
    }
    return (
      <LinkButton href={`/trip/${tripId}/add-item`} variant="capsule" className="h-[54px] text-[15.5px]">
        <PlusIcon size={19} strokeWidth={2.6} />
        Add an item
      </LinkButton>
    );
  }

  if (isCompleted) {
    return (
      <Button variant="capsuleMuted" className="h-[54px] text-[15.5px]">
        <LockIcon size={17} strokeWidth={2.4} />
        {LOCKED_TRIP_COPY.expenses.short}
      </Button>
    );
  }
  return (
    <LinkButton href={`/trip/${tripId}/add-expense`} variant="capsule" className="h-[54px] text-[15.5px]">
      <PlusIcon size={19} strokeWidth={2.6} />
      Add an expense
    </LinkButton>
  );
}
