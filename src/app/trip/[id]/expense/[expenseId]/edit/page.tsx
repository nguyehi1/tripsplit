import { EditExpenseSheetContent } from "../../../edit-expense-sheet-content";
import { renderTripDashboard } from "../../../page";
import { SheetShell } from "../../../sheet-shell";

/**
 * The hard-navigation/deep-link fallback for "Edit expense" — same ADR 0008 shape as
 * `add-expense/page.tsx`/`add-item/page.tsx`: a direct hit/bookmark/refresh/shared-link on this
 * URL renders the full trip dashboard via `renderTripDashboard` with the sheet already open on
 * top. `animateEntrance={false}` — no prior "closed" moment for this caller to have seen.
 */
export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  return renderTripDashboard(id, {
    sheet: (
      <SheetShell tripId={id} animateEntrance={false}>
        <EditExpenseSheetContent tripId={id} expenseId={expenseId} />
      </SheetShell>
    ),
  });
}
