import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TripTabProvider } from "./trip-tab-context";
import { TripTabs } from "./trip-tabs";

/**
 * `TripTabs` now reads its active tab from `TripTabProvider` (shopping-list, so `page.tsx`'s
 * sibling `BottomBar` can be tab-aware too — see `trip-tab-context.tsx`), a required ancestor for
 * any render. `shoppingList: null` matches every one of these existing tests' scenarios (no
 * shopping-list data fixture involved). None of these tests switch to the "list" tab, so the
 * List-tab-only `TripVerificationProvider` requirement (`shopping-list-tab.tsx`'s
 * `useTripVerification`, which itself calls `useRouter` — unmocked/unmountable in this plain
 * `renderToStaticMarkup` setup) never comes into play here and is deliberately not added. Renamed
 * `.ts` -> `.tsx` (no behavior change to the tests themselves) so this wrapper can be plain JSX
 * instead of nested `createElement` calls with children-in-props, which `react/no-children-prop`
 * disallows.
 */
function renderTripTabs(props: Omit<Parameters<typeof TripTabs>[0], "shoppingList">) {
  return renderToStaticMarkup(
    <TripTabProvider initialTab="expenses">
      <TripTabs {...props} shoppingList={null} />
    </TripTabProvider>,
  );
}

const you = {
  id: "m1",
  displayName: "Alice",
  joinedAt: "2026-01-01",
  isOrganizer: true,
  isPlaceholder: false,
  initials: "A",
  avatar: { bg: "#fff", fg: "#000" },
  paidCents: 1000,
  shareCents: 500,
  netCents: 500,
  expenseCount: 1,
};

const otherMember = { ...you, id: "m2", displayName: "Bob", isOrganizer: false };

function makeExpense(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "e1",
    paidBy: "m1",
    amountCents: 500,
    description: "Dinner",
    day: "Mon, 3/5",
    payer: you,
    ...overrides,
  };
}

describe("TripTabs — editable expense row", () => {
  it("wraps an editable row (payer is you, trip not completed) in a real <a> link to its edit page", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      });
    expect(html).toContain(`href="/trip/trip-1/expense/e1/edit"`);
  });

  it("does NOT make the row a link when the payer is someone else", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you, otherMember],
        expenses: [makeExpense({ payer: otherMember })],
        you,
        isCompleted: false,
      });
    expect(html).not.toContain("expense/e1/edit");
  });

  it("does NOT make the row a link when the trip is completed, even if you are the payer", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: true,
      });
    expect(html).not.toContain("expense/e1/edit");
  });

  it("defaults to the 'Expenses' tab on first render (matches client hydration default, avoids AC-flagged hydration mismatch)", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      });
    expect(html).toContain("Dinner");
    // Details-tab-only content (member "Up $x on their share" balance labels) shouldn't render yet.
    expect(html).not.toContain("on their share");
  });

  it("renders the empty-expenses message when there are no expenses", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you],
        expenses: [],
        you,
        isCompleted: false,
      });
    expect(html).toContain("No expenses logged yet.");
  });

  it("once a trip has real expenses, the empty-state row disappears", () => {
    const html = renderTripTabs({
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      });
    expect(html).not.toContain("No expenses logged yet.");
  });
});
