import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * QA coverage for the brand mark at its three call sites, as of the latest round of live user
 * feedback (2026-10-18, sixth pass on Welcome / 2026-10-16 on the first-run card — see the dated
 * comments in `home-screen.tsx` and `trips/page.tsx`). `requirements.md`/`brand-lockup-s.md` have
 * NOT been updated to match these changes yet (doc reconciliation is a pending follow-up, tracked
 * in the QA report, not a code defect) — this file asserts the actual, user-confirmed shipped
 * behavior rather than the currently-stale docs:
 *
 * - **Welcome** (`/`): a bespoke composition — a 150×150px rounded tile (`rounded-[28px]`,
 *   `--color-accent-soft` fill, rotated 8deg as one rigid sticker) bleeding off the top-right
 *   corner, a 126×93px `DogFace` inside it, a tilted "Divide by 6?" speech bubble, and a separate
 *   150×42px `Wordmark` above it as its own line. `BrandRow` is not used here at all.
 * - **Home title** (`/trips`'s `TopBar`): wordmark-only, no icon, at 150×42px — user: "Remove the
 *   logo, the word Splitiful need to be bigger."
 * - **Home first-run card**: also moved off `BrandRow` (2026-10-16, "corrected from the user's
 *   pasted canvas export") — a 167×167px white outer card containing a 149×149px
 *   `--color-logo-plate` inner square containing a 135×103px `DogFace` alone, no wordmark inside
 *   the card (the page's own title above already carries it). `BrandRow`'s `"welcome"` and
 *   `"compact"` size presets now have no remaining caller anywhere in the app (grepped) —
 *   `brand-row.qa.test.tsx` still exercises both as direct component-level tests of still-
 *   supported size variants, not as a claim that either is wired up anywhere.
 */

const getUserMock = vi.fn();
const getMyTripsMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    // Covers both Welcome's `/`'s simple `.select().eq()` read and `/trips`'s own
    // `.select().order()` prefetch chain (performance-scaling's Tier 1 fix) — same mock shape as
    // `trips/page.qa.test.ts`'s `createSupabaseMock`.
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [] }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  })),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/data/trips", () => ({
  getMyTrips: (...args: unknown[]) => getMyTripsMock(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  // HomeNavBar (redesign-ui) reads usePathname() to compute which tab is active.
  usePathname: () => "/trips",
}));

describe("Welcome ('/'): the bespoke sticker-card + bubble + wordmark composition (not BrandRow)", () => {
  it("renders the 150x150 rotated accent-soft tile, the 126x93 DogFace inside it, the 'Divide by 6?' bubble, and a separate 150x42 Wordmark line", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const { default: HomePage } = await import("@/app/page");
    const html = renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("width:150px;height:150px");
    expect(html).toContain("background:var(--color-accent-soft)");
    expect(html).toContain("width:126px;height:93px");
    expect(html).toContain("Divide by 6?");
    expect(html).toContain("width:150px;height:42px");
    // Not the compact brand row's sticker-tile construction (10px radius) — a different, bigger
    // housing shape (28px radius) per this composition.
    expect(html).not.toContain("rounded-[10px]");
  });
});

describe("Home ('/trips') title: wordmark-only at 150x42, no icon (user feedback, 2026-10-16: 'the word Splitiful need to be bigger')", () => {
  it("renders a bare 150x42 Wordmark in the TopBar title, with no sticker-tile icon", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("@/app/trips/page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    const topBarIdx = html.indexOf('class="flex items-center gap-3 px-1 pb-1 pt-5"');
    const firstRunCardIdx = html.indexOf("flex flex-col items-center px-5 py-7 text-center");
    const titleWordmarkHtml = html.slice(topBarIdx, firstRunCardIdx);
    expect(titleWordmarkHtml).toContain("width:150px;height:42px");
    // No sticker-tile icon (10px radius) in the title row itself, before the first-run card.
    expect(titleWordmarkHtml).not.toContain("rounded-[10px]");
  });

  it("the first-run card is a 167x167 white card with a 149x149 logo-plate square and a 135x103 DogFace, no BrandRow and no wordmark inside the card", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    getMyTripsMock.mockResolvedValueOnce([]);
    const { default: TripsDashboardPage } = await import("@/app/trips/page");
    const html = renderToStaticMarkup(await TripsDashboardPage());
    expect(html).toContain("width:167px;height:167px");
    expect(html).toContain("width:149px;height:149px");
    expect(html).toContain("background:var(--color-logo-plate)");
    expect(html).toContain("width:135px;height:103px");
    expect(html).toContain("rounded-[28px]");
    expect(html).toContain("rounded-[20px]");
    // No compact BrandRow tile (10px radius) and no wordmark rendered inside the card itself —
    // the page's own title above already carries the wordmark.
    expect(html).not.toContain("rounded-[10px]");
    expect(html.match(/alt="Splitiful"/g)).toHaveLength(1);
  });
});
