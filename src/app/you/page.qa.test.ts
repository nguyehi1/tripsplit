import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * QA coverage for the new `/you` route (redesign-ui requirements item 4 / AC13; design.md §4.6;
 * architecture.md §2.3). This is a genuinely new screen, not a restyle — this file checks the
 * acceptance criteria directly: Privacy/Terms present as rows with unchanged links, the unified
 * `HomeNavBar` mounted with "You" active, and the defensive no-user fallback.
 */

const getUserMock = vi.fn();
const getMyDisplayNameMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}));

vi.mock("@/lib/data/trips", () => ({
  getMyDisplayName: (...args: unknown[]) => getMyDisplayNameMock(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  usePathname: () => "/you",
}));

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  getMyDisplayNameMock.mockResolvedValue("Dana");
});

describe("YouPage (smoke, via renderToStaticMarkup)", () => {
  it("renders Privacy and Terms as rows pointing at the existing, unmodified pages (AC13)", async () => {
    const { default: YouPage } = await import("./page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain(">Privacy<");
    expect(html).toContain(">Terms<");
  });

  it("mounts the unified HomeNavBar with 'You' active (AC3)", async () => {
    const { default: YouPage } = await import("./page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('href="/trips"');
    expect(html).toContain('href="/trip/new"');
    // "You" tab is active: bold label + accent-text color + the 56x3px top accent line.
    expect(html).toMatch(/text-\[11px\] leading-none font-bold text-accent-text">You</);
  });

  it("shows the display name fetched server-side when one is already set", async () => {
    const { default: YouPage } = await import("./page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).toContain("Dana");
  });

  it("falls back to the name-prompt form when no display name is set yet", async () => {
    getMyDisplayNameMock.mockResolvedValueOnce(null);
    const { default: YouPage } = await import("./page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).toContain("What should everyone call you?");
  });

  it("redirects to / when there is no user (defensive fallback, same pattern as /trips)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const { default: YouPage } = await import("./page");
    await expect(YouPage()).rejects.toThrow("REDIRECT:/");
  });

  it("does not throw when getMyDisplayName itself fails — defensive fallback, not a thrown error", async () => {
    getMyDisplayNameMock.mockRejectedValueOnce(new Error("boom"));
    const { default: YouPage } = await import("./page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).toContain("What should everyone call you?");
  });
});
