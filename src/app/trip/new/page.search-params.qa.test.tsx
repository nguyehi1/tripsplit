import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn();
const notFoundMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...a: unknown[]) => redirectMock(...a),
  notFound: (...a: unknown[]) => notFoundMock(...a),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/data/trips", () => ({ createTrip: vi.fn() }));
vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

import NewTripPage from "./page";
import { NewTripForm } from "./new-trip-form";

const call = (params: Record<string, unknown>) => NewTripPage({ searchParams: Promise.resolve(params) });

afterEach(() => vi.restoreAllMocks());

describe("/trip/new server wrapper: ?type=", () => {
  it("passes a valid catalog code to NewTripForm as initialType, and nothing else", async () => {
    const el = await call({ type: "camping", utm_source: "x", next: "//evil" });
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(NewTripForm);
    expect(el.props).toEqual({ initialType: "camping" });
  });

  it.each([
    ["unknown", "bogus"],
    ["empty", ""],
    ["wrong case", "Camping"],
    ["padded", "camping "],
    ["other", "other"],
    ["prototype key", "__proto__"],
    ["repeated key", ["camping", "junk"]],
    ["single-item array", ["camping"]],
    ["malformed encoding (as Next decodes it)", "%E0%A4%A"],
    ["markup", "<script>alert(1)</script>"],
    ["attribute breakout", '"><img src=x onerror=alert(1)>'],
  ])("yields a blank form for %s", async (_label, value) => {
    const el = await call({ type: value });
    expect(el.props).toEqual({ initialType: undefined });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("never echoes a hostile value in the rendered markup and checks no tile", async () => {
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    for (const value of [
      "<script>alert(1)</script>",
      "%3Cscript%3Ealert(1)%3C%2Fscript%3E",
      '"><img src=x>',
      "%22%3E%3Cimg%20src%3Dx%3E",
    ]) {
      const html = renderToStaticMarkup(await call({ type: value }));
      expect(html).not.toContain("alert(1)");
      expect(html).not.toContain("<img src=x");
      expect(html).not.toContain(value);
      expect(html).not.toContain("checked");
    }
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("renders the tile checked on the server for a valid code (no flash)", async () => {
    const html = renderToStaticMarkup(await call({ type: "airbnb" }));
    expect(html).toContain("checked");
    expect(html).toContain("Your list will open with suggestions for an Airbnb stay.");
  });

  it("is a thin server component: only the form and the parser, no data, Supabase, tracking or redirect", () => {
    const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
    const imports = [...src.matchAll(/^import .* from "(.+)";$/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["./new-trip-form", "@/lib/starter-suggestions"]);
    for (const banned of ["useSearchParams", "generateMetadata", "redirect(", "notFound(", "console."]) {
      expect(src).not.toContain(banned);
    }
  });
});
