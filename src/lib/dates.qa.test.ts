import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatDayDate } from "./dates";

/**
 * The ssr-trip-pages architecture doc's whole justification for the UTC pin is that these
 * functions must produce the SAME output regardless of which timezone the executing runtime
 * is in (browser vs. server). These tests actually flip `process.env.TZ` at runtime — via
 * vitest's `vi.stubEnv` equivalent, `process.env.TZ` plus re-import isn't reliable for the
 * Intl/Date internals in the same process, so instead we assert cross-zone equivalence by
 * comparing results computed while TZ is set to several different zones within the same
 * process. Node's Intl/Date do re-read process.env.TZ per Date/Intl call (no caching across
 * distinct constructions), so this is a valid way to exercise the code as it would behave in
 * differently-zoned Vercel/browser runtimes.
 */
describe("dates.ts — UTC pin holds across runtime timezones (ssr-trip-pages regression)", () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  const zones = ["UTC", "Pacific/Kiritimati", "Pacific/Niue", "Asia/Tokyo", "America/Los_Angeles"];

  it("formatDate is identical across runtime timezones, including one ahead of UTC (Tokyo) and one behind (Niue)", () => {
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return formatDate("2026-01-01");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("Jan 1");
  });

  it("formatDayDate is identical across runtime timezones for a date near a month/year boundary", () => {
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return formatDayDate("2025-12-31");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("Wed, 12/31");
  });

  it("formatDateRange is identical across runtime timezones for a cross-month range", () => {
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return formatDateRange("2026-02-27", "2026-03-02");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("Feb 27 – Mar 2");
  });

  it("formatDateRange is identical across runtime timezones for a leap-day range", () => {
    const results = zones.map((tz) => {
      process.env.TZ = tz;
      return formatDateRange("2028-02-28", "2028-03-01");
    });
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe("Feb 28 – Mar 1");
  });

  it("a single date at exact UTC midnight never shifts to the prior/next calendar day in any zone (the regression this pin fixes)", () => {
    // Before the fix, parsing 'T00:00:00' as *local* time in a zone ahead of UTC (e.g. Tokyo,
    // UTC+9) combined with a UTC-formatted output would have shown Dec 31 instead of Jan 1.
    process.env.TZ = "Asia/Tokyo";
    expect(formatDate("2026-01-01")).toBe("Jan 1");
    process.env.TZ = "Pacific/Niue"; // UTC-11, the other direction
    expect(formatDate("2026-01-01")).toBe("Jan 1");
  });
});

describe("dates.ts — existing behavior preserved (no regression from the UTC pin)", () => {
  beforeEach(() => {
    process.env.TZ = "UTC";
  });
  afterEach(() => {
    process.env.TZ = process.env.TZ;
  });

  it("formatDate still omits the year", () => {
    expect(formatDate("2026-03-05")).not.toContain("2026");
  });

  it("formatDateRange collapses to a single date when only one side is present", () => {
    expect(formatDateRange("2026-03-05", null)).toBe("Mar 5");
    expect(formatDateRange(null, "2026-03-05")).toBe("Mar 5");
  });
});
