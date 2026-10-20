import { describe, expect, it, vi } from "vitest";
import { ExpenseActionError } from "@/lib/errors";
import { deleteExpense, undoDeleteExpense } from "./trips";

function clientReturning(error: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  return { client: { rpc } as never, rpc };
}

describe("deleteExpense / undoDeleteExpense", () => {
  it("call the RPCs with only the expense id", async () => {
    const del = clientReturning(null);
    await deleteExpense(del.client, "e1");
    expect(del.rpc).toHaveBeenCalledWith("delete_expense", { _expense_id: "e1" });
    const undo = clientReturning(null);
    await undoDeleteExpense(undo.client, "e1");
    expect(undo.rpc).toHaveBeenCalledWith("undo_delete_expense", { _expense_id: "e1" });
  });

  it("throw a code-only ExpenseActionError, never the raw error", async () => {
    const raw = { code: "EX001", message: "expense_not_available", details: "secret row", hint: "h" };
    const { client } = clientReturning(raw);
    const err = await deleteExpense(client, "e1").catch((e) => e);
    expect(err).toBeInstanceOf(ExpenseActionError);
    expect(err.code).toBe("not_allowed");
    expect(JSON.stringify(err)).not.toContain("secret");
    expect(err.message).toBe("not_allowed");
    const undoErr = await undoDeleteExpense(clientReturning({ code: "EX002", message: "m" }).client, "e1").catch((e) => e);
    expect(undoErr.code).toBe("undo_unavailable");
  });
});
