import { AddExpenseSheetContent } from "../add-expense-sheet-content";
import { renderTripDashboard } from "../page";
import { SheetShell } from "../sheet-shell";

/**
 * The hard-navigation/deep-link fallback (ADR 0008 point 4) required by AC8: a direct hit,
 * bookmark, or refresh on this literal URL doesn't go through the `@sheet` slot at all (Next
 * only intercepts client-side soft navigation), so this file independently renders the full trip
 * dashboard — via the same `renderTripDashboard` used by `../page.tsx` — with the sheet already
 * open on top, not a blank/broken state. `animateEntrance={false}`: there's no prior "closed"
 * moment for this caller to have seen (design.md section 5.3), so the sheet and the dimmed trip
 * view both render already at rest, with no replayed entrance animation.
 */
export default async function AddExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderTripDashboard(id, {
    sheet: (
      <SheetShell tripId={id} animateEntrance={false}>
        <AddExpenseSheetContent tripId={id} />
      </SheetShell>
    ),
  });
}
