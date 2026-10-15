import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
  })),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { STARTER_TYPES } from "@/lib/starter-catalog";

async function render(searchParams: Record<string, string | undefined>) {
  const { default: HomePage } = await import("./page");
  return renderToStaticMarkup(await HomePage({ searchParams: Promise.resolve(searchParams) }));
}

describe("welcome page `/`: template shelf", () => {
  it("renders the shelf between the intro and 'Create your first trip' for a signed-out visitor", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const html = await render({});
    const intro = html.indexOf("no account needed to start");
    const shelf = html.indexOf("Start from a template");
    const create = html.indexOf("Create your first trip");
    expect(intro).toBeGreaterThan(0);
    expect(shelf).toBeGreaterThan(intro);
    expect(create).toBeGreaterThan(shelf);
    for (const t of STARTER_TYPES) expect(html).toContain(`href="/trip/new?type=${t.code}"`);
    expect(html).toContain("h-[26px]");
  });

  it("renders no shelf on the sign-in form (?signin=1)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const html = await render({ signin: "1" });
    expect(html).not.toContain("Start from a template");
    expect(html).not.toContain("/trip/new?type=");
  });

  it("builds hrefs only from catalog codes, even when the URL carries hostile query keys", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const html = await render({ type: "<script>alert(1)</script>", next: "//evil.example", utm_source: "x" });
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("evil.example");
    expect(html).not.toContain("utm_source");
    const hrefs = [...html.matchAll(/href="(\/trip\/new[^"]*)"/g)].map((m) => m[1]);
    const allowed = new Set(["/trip/new", ...STARTER_TYPES.map((t) => `/trip/new?type=${t.code}`)]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const h of hrefs) expect(allowed.has(h), h).toBe(true);
  });

  it("keeps the returning-visitor redirects", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "u", is_anonymous: false } } });
    await expect(render({})).rejects.toThrow("REDIRECT:/trips");
  });

  it("page.tsx reads only `signin` (no `type` read, zero Revision 3 logic)", () => {
    const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(src).toContain("const { signin } = await searchParams;");
    expect(src).not.toMatch(/\btype\b\s*[,}]|searchParams\.type|template-shelf|trackEvent/);
  });
});
