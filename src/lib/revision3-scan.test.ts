import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source scans for Revision 3 (template shelf, ?type= pre-check): the shelf makes no network,
 * Supabase, storage or cookie use; only the two tile leaves fire analytics; `@vercel/analytics`
 * stays behind `tracking.ts`; and the List tab never imports the shelf.
 */

const SRC = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
// Comments are stripped so prose that mentions a banned API is not an offender.
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|bench)\.tsx?$/.test(name) && !/\.qa\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const SHELF_FILES = ["components/template-shelf.tsx", "components/template-tile.tsx", "components/trip-type-icons.ts"];

describe("template shelf: no data, network or storage", () => {
  it.each(SHELF_FILES)("%s imports no Supabase, data layer or next/headers", (rel) => {
    const src = code(rel);
    expect(src).not.toMatch(/from "@\/lib\/supabase\//);
    expect(src).not.toMatch(/from "@\/lib\/data\//);
    expect(src).not.toContain("next/headers");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie|history\.(replace|push)State/);
    expect(src).not.toMatch(/useRouter|router\.push/);
  });

  it("the shelf itself is a server-renderable component with no hooks", () => {
    const src = code("components/template-shelf.tsx");
    expect(src.trimStart().startsWith('"use client"')).toBe(false);
    expect(src).not.toMatch(/\buse(State|Effect|Id|Ref|Memo)\b/);
  });

  it("only the tile leaves call trackEvent among the Revision 3 files", () => {
    const callers = ["components/template-shelf.tsx", "components/trip-type-icons.ts", "app/trip/new/page.tsx"].filter((rel) =>
      /trackEvent\s*\(/.test(code(rel)),
    );
    expect(callers).toEqual([]);
    expect(code("components/template-tile.tsx")).toMatch(/trackEvent\(/);
  });

  it("no non-test source passes `types=` to TemplateShelf (Sec A2)", () => {
    for (const file of sourceFiles(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/<TemplateShelf\b([^>]*)>/g)) {
        expect(m[1], file).not.toMatch(/\btypes\s*=/);
      }
    }
  });
});

describe("analytics and the List tab", () => {
  it("@vercel/analytics is imported only by tracking.ts", () => {
    const importers = sourceFiles(SRC)
      .filter((f) => /@vercel\/analytics/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")))
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => f !== "lib/tracking.ts" && !f.startsWith("app/layout"));
    expect(importers).toEqual([]);
  });

  it("the List tab, the Suggested card and the add-item sheet do not import the shelf", () => {
    for (const rel of [
      "app/trip/[id]/shopping-list-tab.tsx",
      "app/trip/[id]/suggested-card.tsx",
      "app/trip/[id]/add-item-sheet-content.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(/template-shelf|template-tile/);
    }
  });

  it("the picker no longer owns a local icon map", () => {
    expect(code("app/trip/new/trip-type-picker.tsx")).not.toContain("TILE_ICONS");
  });

  it("src/app/page.tsx has no Revision 3 logic", () => {
    const src = code("app/page.tsx");
    expect(src).not.toMatch(/template|parseTypeParam|trackEvent/);
  });
});
