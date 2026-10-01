import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getTripViewMock = vi.fn();
const getTripSummaryMock = vi.fn();
const wasRemovedFromTripMock = vi.fn().mockResolvedValue(false);
// Default user has no `is_anonymous` field (so `!== true` reads as verified) — this is the
// implicit "verified organizer" identity most of this file's full-detail-tier tests rely on.
// Tests exercising the summary tier's "stranger"/"unverified visitor" scenarios override this
// per-call via `mockResolvedValueOnce` below, rather than flipping the shared default and
// breaking every full-detail-tier assertion that depends on it staying verified.
const getUserMock = vi.fn(async (): Promise<{ data: { user: { id: string; is_anonymous?: boolean } | null } }> => ({
  data: { user: { id: "user-1" } },
}));

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
    auth: { getUser: () => getUserMock() },
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getTripView: (...args: unknown[]) => getTripViewMock(...args),
  getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
  wasRemovedFromTrip: (...args: unknown[]) => wasRemovedFromTripMock(...args),
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
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: true } } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Trip summary");
    expect(html).toContain("See full details");
    expect(html).not.toContain("Lake Tahoe");
  });

  // Pre-push review fix 1 (original), superseded by migration 0016: the bare-`/trip/[id]` "See
  // full details" link must carry enough for confirming email to actually join the visitor as a
  // member, instead of leaving them verified but never added, looping back to this exact screen
  // forever. It now does that via the trip's own UUID (`joinTripId`, `join_trip_by_id`) instead
  // of the invite code — docs/ROADMAP.md's invite-code-rpc-hardening entry, "should-fix" item on
  // `get_trip_summary` leaking the invite code to any UUID holder.
  it('"See full details" link on the summary-only tier includes the trip id, not the invite code (fix for the verify-but-never-join loop)', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: true } } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("joinTripId=trip-1");
    expect(html).toContain("/check-email?trigger=detail&amp;joinTripId=trip-1");
    expect(html).not.toContain("invite=");
  });

  // 2026-10-01 follow-up to migration 0016 (live smoke test finding): a visitor who already has
  // a verified, non-anonymous session shouldn't be sent through the email+OTP detour at all —
  // among other things, if their email happens to already be their own registered account, the
  // anonymous-linking attempt that detour would otherwise require fails outright (Supabase's
  // `email_exists`). They get `JoinTripInline`'s one-field form instead.
  it('shows "Join this trip?" with a direct join form (no /check-email) when the visitor already has a verified session', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: false } } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Join this trip?");
    expect(html).toContain("Your name");
    expect(html).not.toContain("See full details");
    expect(html).not.toContain("/check-email");
  });

  // ADR 0012's ghost-payer screen, updated by migration 0016 then by the 2026-10-01 follow-up
  // above: "Rejoin with the invite link" used to link straight to `/join/<inviteCode>`, then to
  // `/check-email?joinTripId=<id>`, both needing an email+OTP round trip this screen's own
  // precondition (always a verified, non-anonymous session) makes unnecessary. It now joins
  // directly via `JoinTripInline`, no detour at all.
  it('removed-member screen rejoins directly via JoinTripInline, no /check-email or invite code', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: false } } });
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(null);
    wasRemovedFromTripMock.mockResolvedValueOnce(true);
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("You&#x27;re no longer on this trip.");
    expect(html).toContain("Rejoin trip");
    expect(html).not.toContain("/join/");
    expect(html).not.toContain("/check-email");
  });

  it("renders the empty-expenses state (AC6)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({ ...baseView, expenses: [] });
    const el = await callPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("No expenses logged yet.");
  });

  it("a trip with real expenses renders no empty-state copy", async () => {
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
    expect(html).not.toContain("No expenses logged yet.");
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
