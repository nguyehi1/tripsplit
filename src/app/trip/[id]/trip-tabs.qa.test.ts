import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { TripTabs } from "./trip-tabs";

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
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      }),
    );
    expect(html).toContain(`href="/trip/trip-1/expense/e1/edit"`);
  });

  it("does NOT make the row a link when the payer is someone else", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you, otherMember],
        expenses: [makeExpense({ payer: otherMember })],
        you,
        isCompleted: false,
      }),
    );
    expect(html).not.toContain("expense/e1/edit");
  });

  it("does NOT make the row a link when the trip is completed, even if you are the payer", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: true,
      }),
    );
    expect(html).not.toContain("expense/e1/edit");
  });

  it("defaults to the 'Expenses' tab on first render (matches client hydration default, avoids AC-flagged hydration mismatch)", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      }),
    );
    expect(html).toContain("Dinner");
    // Details-tab-only content (member "Up $x on their share" balance labels) shouldn't render yet.
    expect(html).not.toContain("on their share");
  });

  it("renders the empty-expenses message when there are no expenses", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [],
        you,
        isCompleted: false,
      }),
    );
    expect(html).toContain("No expenses logged yet — Miso&#x27;s ready when you are.");
  });

  it("empty-expenses state (AC13/design.md section 4) also renders the actual Miso cameo image, not just the updated copy string", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [],
        you,
        isCompleted: false,
      }),
    );
    expect(html).toContain('src="/images/miso_01.jpg"');
    // Whole-photo treatment — no circular crop/mask.
    expect(html).not.toMatch(/<img src="\/images\/miso_01\.jpg"[^>]*class="[^"]*rounded-full[^"]*"/);
  });

  it("once a trip has real expenses, the whole empty-state row (and Miso with it) disappears — no lingering mascot on the common, high-frequency case", () => {
    const html = renderToStaticMarkup(
      createElement(TripTabs, {
        tripId: "trip-1",
        members: [you],
        expenses: [makeExpense()],
        you,
        isCompleted: false,
      }),
    );
    expect(html).not.toContain("miso_01.jpg");
    expect(html).not.toContain("Miso");
  });
});
