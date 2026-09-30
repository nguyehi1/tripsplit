import { EditExpenseSheetContent } from "../../../../edit-expense-sheet-content";
import { SheetShell } from "../../../../sheet-shell";

export default async function InterceptedEditExpense({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  return (
    <SheetShell tripId={id} animateEntrance>
      <EditExpenseSheetContent tripId={id} expenseId={expenseId} />
    </SheetShell>
  );
}
