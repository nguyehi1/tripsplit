import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getMyTripsMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

/**
 * Performance-scaling Tier 1 fix (architecture.md's "/trips — two tiers"): the page now kicks off
 * its own `trips` select concurrently with `getUser()`, rather than only calling `getUser()` here
 * — so this mock needs a `.from("trips").select(...).order(...)` chain in addition to `auth`,
 * even though `getMyTrips` itself is mocked separately below and never exercises this chain for
 * real. `tripRows` defaults to empty since every test that cares about actual trip data supplies
 * it via `getMyTripsMock` instead.
 */
function createSupabaseMock(tripRows: unknown[] = []) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: tripRows, error: null })),
      })),
    })),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => createSupabaseMock()),
}));

vi.mock("@/lib/data/trips", () => ({
  getMyTrips: (...args: unknown[]) => getMyTripsMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  // HomeNavBar (redesign-ui) reads usePathname() to compute which tab is active.
  usePathname: () => "/trips",
}));

describe("TripsDashboardPage (smoke, via renderToStaticMarkup)", () => {
  it("renders real trip data directly in the HTML output — no client-fetch loading placeholder (AC1)", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        types: [],
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Lake Tahoe");
    expect(html).not.toContain("Loading your trips");
  });

  it("groups trips into Ongoing and Completed sections", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        types: [],
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
      },
      {
        id: "trip-2",
        name: "Big Sur",
        location: "Big Sur",
        startsOn: "2026-01-05",
        endsOn: "2026-01-09",
        isCompleted: true,
        createdAt: "2025-12-01",
        types: [],
        members: [],
        totalCents: 2000,
        yourNetCents: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Ongoing");
    expect(html).toContain("Completed");
    expect(html.indexOf("Ongoing")).toBeLessThan(html.indexOf("Lake Tahoe"));
    expect(html.indexOf("Completed")).toBeLessThan(html.indexOf("Big Sur"));
    expect(html.indexOf("Lake Tahoe")).toBeLessThan(html.indexOf("Big Sur"));
  });

  it("renders the first-run card for zero trips, with the shelf and the pill (criteria 77, 79)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    expect(html).toContain("No trips yet");
    expect(html).toContain("Splitiful is ready when you are. Pick a template above, or start a blank trip.");
    // No "Your trips" kicker and no Ongoing/Completed sections render on the zero-trips
    // first-run card (redesign-ui AC10) — the card is the entire empty state.
    expect(html).not.toContain("Your trips");
    expect(html).not.toContain("Ongoing");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("You&#x27;re not on any trips yet.");
    expect(html).not.toContain("Start a trip");
    expect(html).toContain("Start from a template");
    expect(html).toContain('href="/trip/new?type=camping"');
    // "New trip" now lives in the HomeNavBar tab strip, not a FabBar pill.
    expect(html).toMatch(/<a[^>]*href="\/trip\/new"[^>]*>(<svg[^>]*>.*?<\/svg>)?<span[^>]*>New trip<\/span><\/a>/);
  });

  it("has an h1 'Trips', no top-bar plus, the Feedback link, and the shelf before the trips (criterion 74)", async () => {
    getMyTripsMock.mockResolvedValueOnce([
      {
        id: "trip-1",
        name: "Lake Tahoe",
        location: "Tahoe",
        startsOn: "2026-03-05",
        endsOn: "2026-03-09",
        isCompleted: false,
        createdAt: "2026-01-01",
        types: [],
        members: [],
        totalCents: 1000,
        yourNetCents: 0,
        itemsToGetCount: 0,
      },
    ]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    // The plain "Trips" h1 is replaced by the wordmark (redesign-ui AC4) — no h1 at all now.
    expect(html).not.toMatch(/<h1[^>]*>Trips<\/h1>/);
    expect(html).toContain('alt="Splitiful"');
    expect(html).not.toContain("Your trips");
    expect(html).toContain('title="Send feedback"');
    expect(html).not.toContain('title="New trip"');
    expect(html.indexOf("Start from a template")).toBeLessThan(html.indexOf("Ongoing"));
    // Tab order: Feedback, tiles, Blank trip (now the last tile in the 2-column grid, not a
    // header link — template-shelf's "Blank trip" restyle), trips, nav bar's "New trip" tab.
    const order = ["/feedback", "?type=camping", ">Blank trip<", "/trip/trip-1", ">New trip<"].map((x) => html.indexOf(x));
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("replaces the old FabBar pill with the unified HomeNavBar's Trips/New trip/You tabs (redesign-ui AC3)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    // Old FabBar capsule fill is gone outright, not just restyled — FabBar is retired on this page.
    expect(html).not.toContain("color-mix(in_srgb,var(--color-ink)_90%,transparent)");
    expect(html).not.toContain("animate-capsule-in");
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain("backdrop-blur-[16px]");
    expect(html).toContain(">Trips</span>");
    expect(html).toContain(">New trip</span>");
    expect(html).toContain(">You</span>");
    expect(html).toContain('href="/you"');
  });

  it("makes no privacy or security claim near the shelf (criteria 96, 116)", async () => {
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("./page");
    const html = renderToStaticMarkup(await TripsDashboardPage()).toLowerCase();
    for (const banned of ["nothing is saved", "no sign-up", "don&#x27;t track", "we don't track", "private"]) {
      expect(html).not.toContain(banned);
    }
  });

  it("renders the inline error message on a fetch failure, not a thrown error (design.md section 4)", async () => {
    getMyTripsMock.mockRejectedValueOnce(new Error("boom"));
    const { default: TripsDashboardPage } = await import("./page");
    const el = await TripsDashboardPage();
    const html = renderToStaticMarkup(el);
    expect(html).toContain("Couldn&#x27;t load your trips.");
    // The shelf and the pill still show, and there is no first-run card.
    expect(html).toContain("Start from a template");
    expect(html).not.toContain("No trips yet");
  });

  describe("trip rows (Revision 4, design.md 16.1)", () => {
    const row = (over: Record<string, unknown> = {}) => ({
      id: "trip-1",
      name: "Lake Tahoe",
      location: null,
      startsOn: "2026-02-14",
      endsOn: "2026-02-17",
      isCompleted: false,
      createdAt: "2026-01-01",
      types: ["camping"],
      members: [{ id: "m1", displayName: "A", isOrganizer: true, isPlaceholder: false, initials: "A", avatar: { bg: "#000", fg: "#fff" } }],
      totalCents: 24000,
      yourNetCents: -1240,
      itemsToGetCount: 3,
      ...over,
    });
    const render = async (rows: unknown[]) => {
      getMyTripsMock.mockResolvedValueOnce(rows);
      const { default: TripsDashboardPage } = await import("./page");
      return renderToStaticMarkup(await TripsDashboardPage());
    };

    it("drops the 'Trip' pill and the avatar stack on every row, and keeps name, dates, people, total and balance", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Big Sur", isCompleted: true, yourNetCents: 0 })]);
      expect(html).not.toMatch(/>Trip<\/span>/);
      expect(html).not.toContain("rounded-full px-[10px] py-[4px] text-[11px] font-semibold\" style=\"background:oklch(0.95 0.04 88)");
      expect(html).not.toContain("rounded-full border-2");
      expect(html).toContain("Lake Tahoe");
      // Row subtitle shows open shopping-list items ("N item(s) to get"), not the money total —
      // matches the handoff's literal example, and is now rendered as separate spans with a
      // styled `·` separator (`mx-1.5 text-faint`), not one plain joined string (design-audit
      // follow-up, 2026-10-16) — parts still read in the same order/content.
      expect(html).toContain(">Feb 14–17</span>");
      expect(html).toContain(">1 person</span>");
      expect(html).toContain(">3 items to get</span>");
      expect(html.match(/<span class="mx-1\.5 text-faint">·<\/span>/g)).toHaveLength(4); // 2 rows x 2 separators each
      expect(html).not.toContain("$240.00");
      expect(html).toContain("You owe $12.40");
      expect(html).toContain("Locked");
      // Locked (completed) trips never show a balance anywhere — not "Settled up", not "You
      // owe"/"You're owed" — a locked trip is settled by definition (user feedback, 2026-10-16).
      // Big Sur (the second, completed row in this test) has yourNetCents: 0, which would
      // otherwise render "Settled up" were it not locked.
      expect(html).not.toContain("Settled up");
    });

    it("uses the compact rhythm: Card px-4 py-1, rows py-[17px] (design-audit.md #4: 17px list row padding, not 14px) with a 40px icon square, 15px/600 body-font name", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Second" })]);
      expect(html).toContain("rounded-card bg-white shadow-card px-4 py-1");
      expect(html).toContain("py-[17px]");
      expect(html).not.toContain("py-3.5");
      expect(html).toContain("size-10 flex-none");
      expect(html).toContain("text-[15px] font-semibold leading-5");
      expect(html).not.toContain("text-display text-[22px]");
    });

    it("draws a stronger divider between rows only, none after the last (redesign-ui AC9: hairline-strong, not border-ink/[0.15])", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Second" }), row({ id: "trip-3", name: "Third" })]);
      expect(html.match(/border-b border-hairline-strong/g)).toHaveLength(2);
      expect(html).not.toContain("divide-y");
      expect(html).not.toContain("border-ink/[0.07]");
      expect(html).not.toContain("border-ink/[0.15]");
    });

    it("skips an absent date without a stray separator, and shows '0 items to get' (open shopping-list items) instead of a money total", async () => {
      const html = await render([
        row({ startsOn: null, endsOn: null, totalCents: 0, yourNetCents: 0, members: [], itemsToGetCount: 0 }),
      ]);
      expect(html).toContain(">0 people</span>");
      expect(html).toContain(">0 items to get</span>");
      // Only one separator (date is absent, so just "people · items to get"), not a stray one
      // where the missing date would have been.
      expect(html.match(/<span class="mx-1\.5 text-faint">·<\/span>/g)).toHaveLength(1);
      expect(html).not.toContain("$0.00");
    });

    it("shows dates across months compactly", async () => {
      const html = await render([row({ startsOn: "2026-12-28", endsOn: "2027-01-02" })]);
      expect(html).toContain("Dec 28 – Jan 2");
    });

    it("keeps the subtitle on the full width: balance on the name line + third line (ongoing); a locked (completed) trip shows the Locked pill and NO balance anywhere, not even a third line", async () => {
      const ongoing = await render([row({ yourNetCents: 5000 })]);
      // Ongoing: once on the name line (>=360px) and once as the third line (<360px).
      expect(ongoing).toContain("hidden flex-none text-right text-[12.5px] leading-5 min-[360px]:block");
      expect(ongoing).toContain("min-[360px]:hidden");
      expect(ongoing.match(/You&#x27;re owed \$50\.00/g)).toHaveLength(2);
      // A locked trip never shows a balance anywhere (user feedback, 2026-10-16) — not on the
      // name line, not on a third line — even though this row has a nonzero yourNetCents that
      // would otherwise render "You're owed $50.00".
      const done = await render([row({ isCompleted: true, yourNetCents: 5000 })]);
      expect(done).toContain("Locked");
      expect(done).not.toContain("You&#x27;re owed $50.00");
      expect(done).not.toContain("min-[360px]:hidden");
      expect(done).not.toContain("min-[360px]:block");
    });

    it("uses the first catalog type's icon, and a neutral pin when there is none", async () => {
      const withType = await render([row({ types: ["airbnb"] })]);
      const without = await render([row({ types: [] })]);
      expect(withType).toContain("M15 21v-8");
      expect(without).toContain("M20 10c0 6-8 12-8 12");
    });

    it("keeps a 14px gap under each kicker (now with counts, redesign-ui AC9) and 36px between Ongoing and Completed (design-audit.md #6: handoff's 14px/36px, not 10px/26px)", async () => {
      const html = await render([row(), row({ id: "trip-2", name: "Done", isCompleted: true })]);
      expect(html).toContain("h-[36px]");
      expect(html).toMatch(/Ongoing \(1\)<\/div><div class="h-\[14px\]">/);
      expect(html).toMatch(/Completed \(1\)<\/div><div class="h-\[14px\]">/);
    });
  });

  it("redirects to / when there is no user (defensive fallback)", async () => {
    const { createClient } = await import("@/lib/supabase/server");
    (createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...createSupabaseMock(),
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    const { default: TripsDashboardPage } = await import("./page");
    await expect(TripsDashboardPage()).rejects.toThrow("REDIRECT:/");
  });

  it("never calls supabase.auth.getUser() from a client bundle context (module has no 'use client' directive)", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    expect(source.trimStart().startsWith('"use client"')).toBe(false);
  });
});
