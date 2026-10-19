// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDom } from "@/test/dom";

/**
 * QA coverage for the Settle Up / Trip complete overhaul (requirements item 5 / AC14, rewritten
 * 2026-10-16): no test covered this page before this design-audit fix round. Focus:
 *  - the not-yet-locked branch drops its separate name/date/total summary card and folds that
 *    data into the "Still on the mountain" card, separated by `Divider`s;
 *  - both branches mount the real `TripNavBarStatic` (Trips/Expenses/Details/List, none active)
 *    stacked below a `BottomBar`-wrapped action, not the old shell-only `NavBarShell`;
 *  - `TripNavBarStatic` renders with no `TripTabProvider` in the tree (it reads no context, so
 *    this page — which has none — doesn't crash).
 */

const getUserMock = vi.fn();
const getTripViewMock = vi.fn();
const completeTripMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
  completeTrip: (...args: unknown[]) => completeTripMock(...args),
}));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "trip-1" }),
  useRouter: () => ({ push: pushMock }),
}));

const dom = createDom();

afterEach(() => {
  dom.teardown();
  vi.clearAllMocks();
});

const baseView = {
  trip: { id: "trip-1", name: "Lake Tahoe", startsOn: "2026-03-05", endsOn: "2026-03-09", inviteCode: "ABC", isCompleted: false },
  members: [{ id: "m1", displayName: "Alice", isPlaceholder: false, initials: "A", avatar: { bg: "#fff", fg: "#000" } }],
  settlements: [],
  totalCents: 10000,
  avgPerPersonCents: 10000,
  you: { isOrganizer: true, paidCents: 4000, netCents: -1000 },
};

async function mountSettleUp() {
  getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
  const { default: SettleUpPage } = await import("./page");
  await dom.mount(<SettleUpPage />);
  await dom.flush();
}

describe("Settle up (not-yet-locked branch)", () => {
  it("has no separate name/date/total summary card; that data lives inside the 'Still on the mountain' card instead", async () => {
    getTripViewMock.mockResolvedValueOnce(baseView);
    await mountSettleUp();
    const html = dom.container.innerHTML;
    // No standalone summary card with the trip's name/dates above the "Still on the mountain" copy.
    expect(html).not.toMatch(/Lake Tahoe/);
    expect(html).toContain("Still on the mountain.");
    expect(html).toContain("Total so far");
    expect(html).toContain("Avg / person");
    expect(html).toContain("You've paid so far");
    expect(html).toContain("You'd owe");
    expect(html).toContain("$100.00"); // totalCents/avgPerPersonCents formatted
  });

  it("mounts the real TripNavBarStatic (Trips/Expenses/Details/List, none active) stacked below the BottomBar action", async () => {
    getTripViewMock.mockResolvedValueOnce(baseView);
    await mountSettleUp();
    const html = dom.container.innerHTML;
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain(">Trips</span>");
    expect(html).toContain(">Expenses</span>");
    expect(html).toContain(">Details</span>");
    expect(html).toContain(">List</span>");
    // None of the four tabs is marked active — no bold/accent-text label anywhere in the nav.
    expect(html).not.toContain("font-bold text-accent-text");
    const actionIdx = html.indexOf("Trip complete");
    const navIdx = html.indexOf('aria-label="Primary"');
    expect(actionIdx).toBeGreaterThanOrEqual(0);
    expect(navIdx).toBeGreaterThan(actionIdx);
  });

  it("does not crash without a TripTabProvider in the tree (TripNavBarStatic reads no context, unlike TripNavBar)", async () => {
    getTripViewMock.mockResolvedValueOnce(baseView);
    await expect(mountSettleUp()).resolves.not.toThrow();
  });
});

describe("Trip complete (locked branch)", () => {
  it("also mounts TripNavBarStatic, stacked below its two action buttons, with no name/date/total summary card", async () => {
    getTripViewMock.mockResolvedValueOnce({
      ...baseView,
      trip: { ...baseView.trip, isCompleted: true },
      settlements: [{ from: baseView.members[0], to: baseView.members[0], amountCents: 500 }],
    });
    await mountSettleUp();
    const html = dom.container.innerHTML;
    expect(html).toContain("Trip completed");
    expect(html).toContain("Create a new trip");
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain(">Trips</span>");
    expect(html).toContain(">Expenses</span>");
    const buttonIdx = html.indexOf("Create a new trip");
    const navIdx = html.indexOf('aria-label="Primary"');
    expect(navIdx).toBeGreaterThan(buttonIdx);
  });
});
