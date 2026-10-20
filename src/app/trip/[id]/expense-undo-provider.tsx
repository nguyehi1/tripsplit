"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { deleteExpense, undoDeleteExpense } from "@/lib/data/trips";
import { ExpenseActionError, expenseUndoErrorCopy } from "@/lib/errors";
import { timeClient } from "@/lib/perf/timing";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/tracking";
import { FLOATING_NOTICE_BOTTOM_CLASS } from "./floating-notice";

// The toast is cosmetic: the database decides the real Undo window (15 s from its own clock).
const TOAST_MS = 10_000;
const RESTORED_MS = 3_000;
const ERROR_MS = 6_000;
const ANNOUNCE_MS = 10_000;

type ExpenseUndoContextValue = {
  /**
   * Deletes the expense and, on success, shows the Undo toast (a new delete replaces any current
   * toast). Throws an `ExpenseActionError` on failure; the caller shows one neutral line.
   */
  requestDelete: (expenseId: string) => Promise<void>;
};

// Without a provider (isolated renders) a delete still works, it just has no toast.
const ExpenseUndoContext = createContext<ExpenseUndoContextValue>({
  requestDelete: (expenseId) => deleteExpense(createClient(), expenseId),
});

export function useExpenseUndo(): ExpenseUndoContextValue {
  return useContext(ExpenseUndoContext);
}

type Toast = {
  expenseId: string;
  /** Wall-clock time the on-screen Undo stops being offered. */
  deadline: number;
  phase: "waiting" | "undoing" | "message";
  /** Waiting: an error line shown in place of "Expense deleted" (Undo stays). Message: the text. */
  text: string | null;
};

/**
 * Owns the pending-Undo state for one trip so it survives the edit sheet closing and the list
 * refreshing after a delete. Mounted in `trip/[id]/layout.tsx` outside the dimmed subtree (the
 * chrome's transform/filter would trap a `fixed` toast). Nothing about a pending Undo goes to the
 * URL or to storage: leaving the trip or reloading drops the toast and the delete stands.
 */
export function ExpenseUndoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const [toast, setToast] = useState<Toast | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const toastRef = useRef<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  function show(next: Toast | null, clearAfterMs?: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    toastRef.current = next;
    setToast(next);
    if (next && clearAfterMs !== undefined) {
      timer.current = setTimeout(() => show(null), clearAfterMs);
    }
  }

  function announce(text: string) {
    if (announceTimer.current) clearTimeout(announceTimer.current);
    setAnnouncement(text);
    announceTimer.current = setTimeout(() => setAnnouncement(""), ANNOUNCE_MS);
  }

  async function requestDelete(expenseId: string) {
    await timeClient("edit-expense", "deleteExpense", () => deleteExpense(createClient(), expenseId));
    show({ expenseId, deadline: Date.now() + TOAST_MS, phase: "waiting", text: null }, TOAST_MS);
    announce("Expense deleted. Undo is available for a few seconds.");
  }

  async function undo() {
    const current = toastRef.current;
    if (!current || current.phase !== "waiting") return;
    show({ ...current, phase: "undoing", text: null });
    try {
      await timeClient("trip", "undoDeleteExpense", () => undoDeleteExpense(createClient(), current.expenseId));
      trackEvent("expense_undo_complete");
      show({ ...current, phase: "message", text: "Expense restored" }, RESTORED_MS);
      announce("Expense restored.");
      router.refresh();
    } catch (e) {
      const code = e instanceof ExpenseActionError ? e.code : "unknown";
      const copy = expenseUndoErrorCopy(code);
      announce(copy);
      const timeLeft = current.deadline - Date.now();
      if ((code === "rate_limited" || code === "unknown") && timeLeft > 0) {
        // No fixed error code (network or throttled): Undo stays offered while time remains.
        show({ ...current, phase: "waiting", text: copy }, timeLeft);
      } else {
        show({ ...current, phase: "message", text: copy }, ERROR_MS);
      }
      // Refresh so the list shows the real state after a refusal.
      if (code === "not_allowed" || code === "undo_unavailable") router.refresh();
    }
  }

  // Shown on the trip page only (all three tabs). Elsewhere it is hidden but keeps its deadline.
  const visible = toast !== null && pathname === `/trip/${params.id}`;

  return (
    <ExpenseUndoContext.Provider value={{ requestDelete }}>
      {children}
      <div role="status" className="sr-only">
        {announcement}
      </div>
      {visible && toast ? (
        <div
          className={`pointer-events-none fixed ${FLOATING_NOTICE_BOTTOM_CLASS} left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-5`}
        >
          <div
            className="pointer-events-auto mx-auto flex w-fit max-w-full items-center gap-4 rounded-[14px] px-3.5 py-2.5 text-[13px] font-medium text-white"
            style={{ background: "color-mix(in srgb, var(--color-ink) 90%, transparent)" }}
          >
            <span>
              {toast.phase === "undoing" ? "Restoring…" : (toast.text ?? "Expense deleted")}
            </span>
            {toast.phase === "waiting" ? (
              <button
                type="button"
                onClick={undo}
                className="-my-3 cursor-pointer px-1 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                style={{ color: "var(--glow-blob-1)" }}
              >
                Undo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ExpenseUndoContext.Provider>
  );
}
