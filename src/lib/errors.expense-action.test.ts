import { describe, expect, it } from "vitest";
import {
  EXPENSE_DELETE_ERROR_COPY,
  expenseActionErrorCode,
  expenseDeleteErrorCopy,
  expenseUndoErrorCopy,
} from "./errors";

describe("expenseActionErrorCode", () => {
  it("maps the fixed SQLSTATEs and the throttle message, nothing else", () => {
    expect(expenseActionErrorCode({ code: "EX001", message: "expense_not_available" })).toBe("not_allowed");
    expect(expenseActionErrorCode({ code: "EX002", message: "expense_undo_unavailable" })).toBe("undo_unavailable");
    expect(expenseActionErrorCode({ code: "P0001", message: "rate limited: try again shortly" })).toBe("rate_limited");
    expect(expenseActionErrorCode({ code: "PGRST202", message: "x" })).toBe("unavailable");
    expect(expenseActionErrorCode({ code: "42883", message: "x" })).toBe("unavailable");
    expect(expenseActionErrorCode({ code: "", message: "TypeError: Failed to fetch" })).toBe("unknown");
    expect(expenseActionErrorCode(null)).toBe("unknown");
  });
});

describe("expense copy", () => {
  it("uses one neutral line for any failed delete", () => {
    expect(expenseDeleteErrorCopy()).toBe(EXPENSE_DELETE_ERROR_COPY);
  });

  it("uses fixed Undo lines per code", () => {
    expect(expenseUndoErrorCopy("undo_unavailable")).toBe(expenseUndoErrorCopy("not_allowed"));
    expect(expenseUndoErrorCopy("unavailable")).toBe("Undo isn't available right now.");
    expect(expenseUndoErrorCopy("unknown")).toBe(expenseUndoErrorCopy("rate_limited"));
  });
});
