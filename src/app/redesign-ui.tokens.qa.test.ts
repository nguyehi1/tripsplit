import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * QA coverage for redesign-ui AC1 ("no raw hex/oklch value from the handoff's token table hard-
 * coded in a component file") and AC6 ("reference-only boards P/Q/Q2/S/S2/D2 are not built").
 * Per architecture.md §1.1's clarification, AC1's literal-grep check is read as "no raw literal
 * in a *restyled* file", not repo-wide — this file greps exactly the files this feature restyled.
 */

const RESTYLED_FILES = [
  "src/components/bottom-nav-bar.tsx",
  "src/components/brand/wordmark.tsx",
  "src/components/brand/dog-face.tsx",
  "src/app/you/page.tsx",
  "src/app/you/you-identity-card.tsx",
  "src/app/trips/page.tsx",
  "src/app/home-screen.tsx",
  "src/app/trip/[id]/page.tsx",
  "src/app/trip/[id]/trip-tabs.tsx",
  "src/app/trip/[id]/settle-up/page.tsx",
  "src/app/trip/[id]/invite/page.tsx",
  "src/app/trip/new/new-trip-form.tsx",
  "src/app/trip/new/trip-type-picker.tsx",
];

// Values from design.md §2's token mapping table, the ones that are genuinely new/renamed this
// pass (not "unchanged" ones that were already a token before this feature, like accent/paper/ink).
const NEW_TOKEN_LITERALS = [
  "rgba(35,28,18,.74)",
  "rgba(35, 28, 18, 0.74)",
  "rgba(35,28,18,.68)",
  "rgba(35, 28, 18, 0.68)",
  "rgba(35,28,18,.08)",
  "rgba(35, 28, 18, 0.08)",
  "rgba(35,28,18,.15)",
  "rgba(35, 28, 18, 0.15)",
  "rgba(35,28,18,.05)",
  "rgba(35, 28, 18, 0.05)",
  "rgba(245,240,230,.72)",
  "rgba(245, 240, 230, 0.72)",
  "#4a2d22",
  "#fffaf1",
];

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

describe("redesign-ui AC1: semantic tokens, not raw literals, in restyled files", () => {
  it.each(RESTYLED_FILES)("%s contains none of the new token table's raw hex/oklch/rgba literals", (path) => {
    const source = read(path);
    for (const literal of NEW_TOKEN_LITERALS) {
      expect(source, `${path} should not hard-code ${literal} — use the named token instead`).not.toContain(literal);
    }
  });
});

describe("redesign-ui AC6: reference-only boards (P, Q, Q2, S, S2, D2) are not built", () => {
  it("no restyled file references the reference-only board names as a layout/component identifier", () => {
    // These boards are reference-only per requirements.md item 3 / non-goals; confirm no file
    // this feature touched introduces a component/layout literally named after one of them
    // (a real build of a reference board would show up as a new identifier like "BoardP"/"boardQ").
    const boardTokens = ["BoardP", "BoardQ", "BoardQ2", "BoardS", "BoardS2", "BoardD2"];
    for (const path of RESTYLED_FILES) {
      const source = read(path);
      for (const token of boardTokens) {
        expect(source).not.toContain(token);
      }
    }
  });
});
