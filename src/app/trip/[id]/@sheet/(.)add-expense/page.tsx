import { AddExpenseSheetContent } from "../../add-expense-sheet-content";
import { SheetShell } from "../../sheet-shell";

/**
 * The intercepted route (ADR 0008 point 3) — only ever reached via client-side soft navigation
 * from `/trip/[id]` (the BottomBar's "Add an expense" capsule, unchanged), so `children` in
 * `layout.tsx` is never re-fetched or remounted: it's the already-rendered trip view, which is
 * what makes a real spring-up-over-an-undisturbed-view animation (AC7) possible. `animateEntrance`
 * is `true` here and only here — see ADR 0008 point 6.
 */
export default async function InterceptedAddExpense({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SheetShell tripId={id} animateEntrance>
      <AddExpenseSheetContent tripId={id} />
    </SheetShell>
  );
}
