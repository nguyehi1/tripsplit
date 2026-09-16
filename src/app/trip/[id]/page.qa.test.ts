import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getTripViewMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const baseView = {
  trip: {
    id: "trip-1",
    name: "Lake Tahoe",
    location: "Tahoe",
    startsOn: "2026-03-05",
    endsOn: "2026-03-09",
    inviteCode: "ABC123",
    isCompleted: false,
  },
  members: [
    {
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
    },
  ],
  expenses: [] as unknown[],
  settlements: [],
  totalCents: 1000,
  avgPerPersonCents: 1000,
  you: null,
};

describe("TripDashboardPage (smoke, via renderToStaticMarkup)", () => {
  it("renders real trip data directly in the HTML output — no loading placeholder (AC1)", async () => {
    getTripViewMock.mockResolvedValueOnce(baseView);
    const { default: TripDashboardPage } = await import("./page");
    const el = await TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Loading your trip");
  });

  it('renders "Couldn\'t load this trip" when getTripView throws (not a member / any failure) (AC4)', async () => {
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const { default: TripDashboardPage } = await import("./page");
    const el = await TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load this trip");
    expect(html).toContain("you may not be on it");
  });

  it("renders the empty-expenses state (AC6)", async () => {
    getTripViewMock.mockResolvedValueOnce({ ...baseView, expenses: [] });
    const { default: TripDashboardPage } = await import("./page");
    const el = await TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("No expenses logged yet.");
  });

  it("shows the locked badge and locked bottom bar when the trip is completed", async () => {
    getTripViewMock.mockResolvedValueOnce({
      ...baseView,
      trip: { ...baseView.trip, isCompleted: true },
    });
    const { default: TripDashboardPage } = await import("./page");
    const el = await TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Locked");
    expect(html).toContain("Trip is locked — no more expenses");
    expect(html).not.toContain("Add an expense");
  });

  it("shows the active Add-an-expense bottom bar (as a real link) when not completed", async () => {
    getTripViewMock.mockResolvedValueOnce(baseView);
    const { default: TripDashboardPage } = await import("./page");
    const el = await TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) });
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Add an expense");
    expect(html).toContain('href="/trip/trip-1/add-expense"');
  });

  it("redirects to / when there is no user (defensive fallback)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const { default: TripDashboardPage } = await import("./page");
    await expect(TripDashboardPage({ params: Promise.resolve({ id: "trip-1" }) })).rejects.toThrow("REDIRECT:/");
  });

  it("never has a 'use client' directive at the top of the file (stays a Server Component)", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
