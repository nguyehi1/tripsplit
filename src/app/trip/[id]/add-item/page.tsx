import { AddItemSheetContent } from "../add-item-sheet-content";
import { renderTripDashboard } from "../page";
import { SheetShell } from "../sheet-shell";

/**
 * The hard-navigation/deep-link fallback for "Add an item" — same ADR 0008 shape as
 * `add-expense/page.tsx` (architecture.md section 4): a direct hit/bookmark/refresh on this URL
 * renders the full trip dashboard via `renderTripDashboard` with the sheet already open on top.
 * `animateEntrance={false}` — no prior "closed" moment for this caller to have seen.
 */
export default async function AddItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderTripDashboard(id, {
    tab: "list",
    sheet: (
      <SheetShell tripId={id} animateEntrance={false}>
        <AddItemSheetContent tripId={id} />
      </SheetShell>
    ),
  });
}
