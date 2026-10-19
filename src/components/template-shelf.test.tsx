import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { STARTER_TYPES } from "@/lib/starter-catalog";
import { TemplateShelf } from "./template-shelf";
import { formatItemCount } from "./template-tile";

vi.mock("@/lib/tracking", () => ({ trackEvent: vi.fn() }));

const html = () => renderToStaticMarkup(<TemplateShelf />);

describe("TemplateShelf", () => {
  it("renders one tile per catalog type, in catalog order, with derived counts", () => {
    const out = html();
    let last = -1;
    for (const type of STARTER_TYPES) {
      const at = out.indexOf(`href="/trip/new?type=${type.code}"`);
      expect(at, type.code).toBeGreaterThan(last);
      last = at;
      expect(out).toContain(type.label);
      expect(out).toContain(formatItemCount(type.items.length));
    }
  });

  it("follows a different catalog passed in (no hardcoded labels or counts)", () => {
    const out = renderToStaticMarkup(
      <TemplateShelf
        types={[
          { code: "camping", label: "Tenting", items: ["a"] },
          { code: "airbnb", label: "Cabins", items: ["a", "b", "c"] },
        ]}
      />,
    );
    expect(out).toContain("Tenting");
    expect(out).toContain("1 item<");
    expect(out).toContain("3 items");
    expect(out).not.toContain("International");
  });

  it("links the tiles to /trip/new?type=<code> and Blank trip to /trip/new", () => {
    const out = html();
    expect(out).toContain('href="/trip/new"');
    expect(out.match(/href="\/trip\/new\?type=[a-z]+"/g)).toHaveLength(STARTER_TYPES.length);
  });

  it("labels the section by its Kicker and names each tile 'Label, N items'", () => {
    const out = html();
    expect(out).toContain('<section aria-labelledby="template-shelf-label">');
    expect(out).toContain('id="template-shelf-label"');
    expect(out).toContain("Start from a template");
    // The accessible name is exactly "Label, N items" (explicit aria-label; no stray space).
    for (const type of STARTER_TYPES) {
      expect(out).toContain(`aria-label="${type.label}, ${formatItemCount(type.items.length)}"`);
    }
    expect(out).not.toContain("sr-only");
  });

  it("renders nothing at all, header included, for an empty catalog (criterion 119)", () => {
    expect(renderToStaticMarkup(<TemplateShelf types={[]} />)).toBe("");
  });

  it("is designed for at most three catalog types (a fourth needs a two-column grid)", () => {
    expect(
      STARTER_TYPES.length,
      "A fourth catalog type: change the shelf grid to two columns (architecture.md 17.2) and refresh the board.",
    ).toBeLessThanOrEqual(3);
  });

  it("wraps labels instead of truncating (criterion 91) and uses the 104px tile (user feedback, 2026-10-16: shorter than the original 128px)", () => {
    const out = html();
    expect(out).toContain("[overflow-wrap:anywhere]");
    expect(out).toContain("[hyphens:auto]");
    expect(out).toContain("h-[104px]");
    expect(out).not.toContain("h-[128px]");
    expect(out).not.toContain("truncate");
    expect(out).not.toContain("whitespace-nowrap");
  });

  it("makes no privacy or security claim (criteria 96, 116)", () => {
    const out = html().toLowerCase();
    for (const banned of ["nothing is saved", "no sign-up", "track", "private", "secure"]) {
      expect(out).not.toContain(banned);
    }
  });

  it("shares one icon module with the New trip picker (criterion 95)", () => {
    const tile = readFileSync(join(__dirname, "template-tile.tsx"), "utf8");
    const picker = readFileSync(join(__dirname, "../app/trip/new/trip-type-picker.tsx"), "utf8");
    expect(tile).toContain("@/components/trip-type-icons");
    expect(picker).toContain("@/components/trip-type-icons");
    expect(picker).not.toContain("TILE_ICONS");
  });
});

describe("formatItemCount", () => {
  it("says '1 item' for one, plural otherwise, and survives zero", () => {
    expect(formatItemCount(1)).toBe("1 item");
    expect(formatItemCount(18)).toBe("18 items");
    expect(formatItemCount(0)).toBe("0 items");
  });
});
