import { AddItemSheetContent } from "../../add-item-sheet-content";
import { SheetShell } from "../../sheet-shell";

/**
 * The intercepted route for the "Add an item" sheet — the exact same ADR 0008 scaffold as
 * `@sheet/(.)add-expense/page.tsx`, reused a second time (architecture.md section 4).
 * `animateEntrance` is `true` here and only here, same reasoning as the add-expense sheet.
 */
export default async function InterceptedAddItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SheetShell tripId={id} animateEntrance>
      <AddItemSheetContent tripId={id} />
    </SheetShell>
  );
}
