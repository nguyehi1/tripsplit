import type { ReactNode } from "react";
import { ExpenseUndoProvider } from "./expense-undo-provider";
import { TripSheetChrome } from "./trip-sheet-chrome";

/**
 * The intercepting/parallel-route scaffold for the add-expense sheet (ADR 0008 points 1, 6).
 * Purely structural — no data fetching here. `children` is the ordinary `/trip/[id]*` subtree
 * (unaffected on every subroute other than `/add-expense`, see ADR 0008's "Consequences"); the
 * `@sheet` slot resolves to the add-expense sheet only when that route is active, `null`
 * everywhere else (see `@sheet/default.tsx`, `@sheet/page.tsx`, `@sheet/[...catchAll]/page.tsx`).
 * The one client leaf is `ExpenseUndoProvider`, which wraps both so a delete made in the edit sheet
 * can show its Undo toast on the trip page after the sheet closes.
 */
export default function TripLayout({
  children,
  sheet,
}: {
  children: ReactNode;
  sheet: ReactNode;
}) {
  return (
    <ExpenseUndoProvider>
      <TripSheetChrome>{children}</TripSheetChrome>
      {sheet}
    </ExpenseUndoProvider>
  );
}
