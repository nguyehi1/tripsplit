import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getTripViewMock = vi.fn();
const getTripSummaryMock = vi.fn();

// The trip page's full-detail branch wraps its mutation entry points in
// `TripVerificationProvider` (src/app/trip/[id]/verify-inline.tsx), a small client leaf that
// calls `useRouter()` for its background `router.refresh()` — see
// docs/features/simplified-onboarding/architecture.md's "Update: hide-and-reveal...". That hook
// requires an app-router context that isn't mounted under a bare `renderToStaticMarkup` call, so
// it's mocked here the same way client-side qa tests elsewhere in this repo mock it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
  getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
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

const baseSummary = {
  members: [{ id: "m1", displayName: "Alice" }],
  settlements: [],
  totalCents: 1000,
  avgPerPersonCents: 1000,
  inviteCode: "abc123",
};

function callPage(overrides: { tab?: string } = {}) {
  return import("./page").then(({ default: TripDashboardPage }) =>
    TripDashboardPage({
      params: Promise.resolve({ id: "trip-1" }),
      searchParams: Promise.resolve(overrides),
    }),
  );
}

describe("TripDashboardPage (smoke, via renderToStaticMarkup)", () => {
  it("renders real trip data directly in the HTML output — no loading placeholder (AC1)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(baseView);
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Loading your trip");
  });

  it('renders "Couldn\'t load this trip" when getTripSummary itself fails (bad id)', async () => {
    getTripSummaryMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load this trip");
    expect(html).toContain("you may not be on it");
  });

  it("renders the summary-only tier when getTripSummary succeeds but getTripView fails (non-owner, unverified caller)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Trip summary");
    expect(html).toContain("See full details");
    expect(html).not.toContain("Lake Tahoe");
  });

  // Pre-push review fix 1: the bare-`/trip/[id]` "See full details" link must carry the trip's
  // invite code so confirming email actually joins the visitor as a member (via /api/join, the
  // same mechanism /join/[code] uses) instead of leaving them verified but never added, looping
  // back to this exact screen forever.
  it('"See full details" link on the summary-only tier includes the invite code (fix for the verify-but-never-join loop)', async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("invite=abc123");
    expect(html).toContain("/check-email?trigger=detail&amp;invite=abc123");
  });

  it("renders the empty-expenses state (AC6)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({ ...baseView, expenses: [] });
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("No expenses logged yet — Miso&#x27;s ready when you are.");
  });

  it("empty-expenses state (AC13) also renders the actual Miso cameo image through the real page tree, not just the updated copy string", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({ ...baseView, expenses: [] });
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain('src="/images/miso_01.jpg"');
  });

  it("a trip with real expenses renders no Miso element at all (design.md section 4: common case stays clean)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({
      ...baseView,
      expenses: [
        {
          id: "e1",
          paidBy: "m1",
          amountCents: 500,
          description: "Dinner",
          day: "Mon, 3/5",
          payer: {
            id: "m1",
            displayName: "Alice",
            isPlaceholder: false,
            initials: "A",
            avatar: { bg: "#fff", fg: "#000" },
          },
        },
      ],
    });
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).not.toContain("miso_01.jpg");
  });

  it("shows the locked badge and locked bottom bar when the trip is completed", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({
      ...baseView,
      trip: { ...baseView.trip, isCompleted: true },
    });
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Locked");
    expect(html).toContain("Trip is locked — no more expenses");
    expect(html).not.toContain("Add an expense");
  });

  it("shows the active Add-an-expense bottom bar (as a real link) when not completed", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(baseView);
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Add an expense");
    expect(html).toContain('href="/trip/trip-1/add-expense"');
  });

  it("never has a 'use client' directive at the top of the file (stays a Server Component)", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
