import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * QA test for AC8 (deep-link/refresh parity) via the hard-nav fallback route
 * (`add-expense/page.tsx` -> `renderTripDashboard(id, { sheet })`, ADR 0008 point 4). Confirms a
 * direct hit / refresh on `/trip/[id]/add-expense` shows a real, non-blank trip view underneath
 * for every tier `renderTripDashboard` can resolve to — not just the full-detail happy path —
 * since `sheet` is meant to be threaded through every branch (page.tsx's own module comment:
 * "sheet is rendered alongside every branch's output ... so a direct hit ... still shows a
 * working, non-blank trip view under the sheet even for a summary-only or not-found caller").
 *
 * Sheet-body assertions here are limited to what a static (non-hydrated) render can show, since
 * `SheetShell`/`AddExpenseSheetContent` are client components gated on `mounted`/effects — the
 * sheet's own visible content and `animateEntrance` behavior are covered separately in
 * `sheet-shell.qa.test.tsx`. This file's job is the base-tier wiring: does the underlying trip
 * view still render (AC8's "not broken or blank"), for every tier, when reached via this literal
 * URL.
 */

const getTripViewMock = vi.fn();
const getTripSummaryMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ kind: "service-role-client" }),
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

function callFallbackPage() {
  return import("./page").then(({ default: AddExpensePage }) =>
    AddExpensePage({ params: Promise.resolve({ id: "trip-1" }) }),
  );
}

describe("add-expense/page.tsx hard-nav fallback (AC8) — sheet threaded through every trip-dashboard tier", () => {
  it("trip not found at all: still renders the 'couldn't load' base view, not a blank/broken page", async () => {
    getTripSummaryMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callFallbackPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load this trip");
  });

  it("summary-only tier (non-owner, unverified caller): still renders the summary base view, not blank", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockRejectedValueOnce(new Error("RLS denied"));
    const el = await callFallbackPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Trip summary");
  });

  it("full-detail tier: renders the real trip dashboard underneath (AC8's core case)", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce(baseView);
    const el = await callFallbackPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Lake Tahoe");
  });

  it("locked trip, full-detail tier: base trip view still renders its locked bottom bar underneath the sheet", async () => {
    getTripSummaryMock.mockResolvedValueOnce(baseSummary);
    getTripViewMock.mockResolvedValueOnce({ ...baseView, trip: { ...baseView.trip, isCompleted: true } });
    const el = await callFallbackPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Trip is locked — no more expenses");
  });

  it("stays an async Server Component (no 'use client' at the top) so it can keep doing the tiered SSR fetch", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
