import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatDayDate, todayIso } from "./dates";

describe("todayIso", () => {
  it("returns today's date in YYYY-MM-DD format", () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("matches the local calendar date components", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(todayIso()).toBe(expected);
  });
});

describe("formatDayDate", () => {
  it("formats a date as 'Weekday, M/D' (AC5)", () => {
    // 2026-09-14 is a Monday.
    expect(formatDayDate("2026-09-14")).toBe("Mon, 9/14");
  });

  it("omits leading zeros on month/day", () => {
    // 2026-01-05 is a Monday.
    expect(formatDayDate("2026-01-05")).toBe("Mon, 1/5");
  });

  it("omits the year", () => {
    expect(formatDayDate("2026-09-14")).not.toContain("2026");
  });

  it("formats a different weekday correctly", () => {
    // 2026-12-06 is a Sunday.
    expect(formatDayDate("2026-12-06")).toBe("Sun, 12/6");
  });
});

describe("formatDate / formatDateRange (regression: unchanged by expense-date-month)", () => {
  it("formatDate still formats a single date without a year", () => {
    expect(formatDate("2026-03-05")).toBe("Mar 5");
  });

  it("formatDateRange still formats a same-month range", () => {
    expect(formatDateRange("2026-03-05", "2026-03-09")).toBe("Mar 5 – 9");
  });

  it("formatDateRange still returns null when both dates are absent", () => {
    expect(formatDateRange(null, null)).toBeNull();
  });
});
