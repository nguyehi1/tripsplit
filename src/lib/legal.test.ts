import { describe, expect, it } from "vitest";
import { LEGAL_LAST_UPDATED } from "./legal";

/**
 * Guards the compliance-baseline rule "any change to data handling bumps LEGAL_LAST_UPDATED".
 * When you next change /privacy or /terms, update the date in legal.ts and move STALE_DATES forward.
 */
const STALE_DATES = ["October 12, 2026"];

describe("LEGAL_LAST_UPDATED", () => {
  it("has been bumped past the date before the trip-types privacy edits", () => {
    for (const stale of STALE_DATES) expect(LEGAL_LAST_UPDATED).not.toBe(stale);
  });

  it("is a parseable 'Month D, YYYY' date", () => {
    expect(LEGAL_LAST_UPDATED).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false);
  });
});
