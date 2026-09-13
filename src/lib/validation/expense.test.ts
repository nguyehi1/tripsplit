import { describe, expect, it } from "vitest";
import { isValidExpenseInput } from "./expense";

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
