import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * expense-delete-and-polish criteria 37 to 41 (QA): Invite member and placeholder rows at 11px
 * vertical, dashed/form rows still 14px; You shows "Send feedback" below Privacy and Terms with
 * a bare /feedback link; trip details keeps its Send feedback icon.
 */

const getUserMock = vi.fn();
const getMyDisplayNameMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: getUserMock } })),
}));
vi.mock("@/lib/data/trips", () => ({
  getMyDisplayName: (...args: unknown[]) => getMyDisplayNameMock(...args),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  usePathname: () => "/you",
}));

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  getMyDisplayNameMock.mockResolvedValue("Dana");
});

const src = (rel: string) => readFileSync(join(__dirname, rel), "utf8");

describe("You: Send feedback row (criterion 38)", () => {
  it("is the third row, after Privacy and Terms, linking to a bare /feedback", async () => {
    const { default: YouPage } = await import("./you/page");
    const html = renderToStaticMarkup(await YouPage());
    const privacy = html.indexOf('href="/privacy"');
    const terms = html.indexOf('href="/terms"');
    const feedback = html.indexOf('href="/feedback"');
    expect(privacy).toBeGreaterThan(-1);
    expect(terms).toBeGreaterThan(privacy);
    expect(feedback).toBeGreaterThan(terms);
    expect(html).toContain(">Send feedback<");
    expect(html).not.toMatch(/href="\/feedback[?#]/);
    expect(html.match(/href="\/feedback"/g)).toHaveLength(1);
    // same row recipe as Terms: 11px vertical, 36px tile, chevron
    const rowStart = html.lastIndexOf("<a", feedback);
    const rowHtml = html.slice(rowStart, html.indexOf("</a>", feedback));
    expect(rowHtml).toContain("py-[11px]");
    expect(rowHtml).toContain("size-9");
    expect(rowHtml).toContain("<svg");
  });

  it("carries no user data or trip id in any link on the page", async () => {
    const { default: YouPage } = await import("./you/page");
    const html = renderToStaticMarkup(await YouPage());
    expect(html).not.toContain("user-1");
    expect(html).not.toMatch(/feedback\?/);
  });
});

describe("Trip details keeps Send feedback; Trips/home does not (criteria 39, 40)", () => {
  it("trip details page still renders the Send feedback icon link to /feedback", () => {
    const page = src("trip/[id]/page.tsx");
    expect(page).toContain('title="Send feedback"');
    expect(page).toContain('href="/feedback"');
  });

  it("Trips/home source has no feedback link or icon import left", () => {
    const page = src("trips/page.tsx");
    expect(page).not.toContain("/feedback");
    expect(page).not.toContain("Send feedback");
    expect(page).not.toContain("MessageSquareIcon");
  });
});

describe("Invite: row padding (criterion 37)", () => {
  const invite = src("trip/[id]/invite/page.tsx");

  it("member and placeholder cards are 11px vertical, 18px horizontal", () => {
    expect(invite.match(/<Card className="p-\[11px_18px\]">/g)).toHaveLength(2);
  });

  it("no member/placeholder card is left at 14px; remaining 14px sites are the non-member rows", () => {
    // Every remaining 14px_18px site must not be a card that renders a member or placeholder row.
    const remaining = [...invite.matchAll(/p-\[14px_18px\]/g)];
    for (const m of remaining) {
      const around = invite.slice(Math.max(0, m.index! - 200), m.index! + 120);
      expect(around).not.toMatch(/members?\.map|placeholders\.map|realMembers\.map/);
    }
  });
});
