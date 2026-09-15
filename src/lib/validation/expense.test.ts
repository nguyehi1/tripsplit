import { describe, expect, it } from "vitest";
import { isValidExpenseDate, isValidExpenseInput } from "./expense";
import { todayIso } from "@/lib/dates";

describe("isValidExpenseInput", () => {
  it("accepts a positive amount and a non-empty description", () => {
    expect(isValidExpenseInput(4200, "Cabin")).toBe(true);
  });

  it("rejects a zero amount", () => {
    expect(isValidExpenseInput(0, "Cabin")).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(isValidExpenseInput(-100, "Cabin")).toBe(false);
  });

  it("rejects an empty description", () => {
    expect(isValidExpenseInput(4200, "")).toBe(false);
  });

  it("rejects a whitespace-only description", () => {
    expect(isValidExpenseInput(4200, "   ")).toBe(false);
  });

  it("accepts a description that has surrounding whitespace but real content", () => {
    expect(isValidExpenseInput(4200, "  Cabin  ")).toBe(true);
  });

  it("rejects when both amount and description are invalid", () => {
    expect(isValidExpenseInput(0, "")).toBe(false);
  });

  it("accepts the smallest positive amount (1 cent)", () => {
    expect(isValidExpenseInput(1, "Gum")).toBe(true);
  });
});

describe("isValidExpenseDate", () => {
  it("accepts today's date", () => {
    expect(isValidExpenseDate(todayIso())).toBe(true);
  });

  it("accepts a past date", () => {
    expect(isValidExpenseDate("2020-01-01")).toBe(true);
  });

  it("rejects a future date (AC4: cannot be in the future)", () => {
    const future = new Date();
    future.setDate(future.getDate() + 1);
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    expect(isValidExpenseDate(iso)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidExpenseDate("")).toBe(false);
  });

  it("rejects a malformed date string", () => {
    expect(isValidExpenseDate("not-a-date")).toBe(false);
  });

  it("rejects a string that matches the pattern but isn't a real calendar date", () => {
    expect(isValidExpenseDate("2024-02-30")).toBe(false);
  });

  it("rejects a date missing zero-padding even if numerically valid", () => {
    expect(isValidExpenseDate("2024-2-9")).toBe(false);
  });

  it("accepts a boundary date exactly at the trip's earliest plausible date (no lower bound)", () => {
    expect(isValidExpenseDate("1999-12-31")).toBe(true);
  });
});
