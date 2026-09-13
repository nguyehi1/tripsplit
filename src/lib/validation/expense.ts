/** Shared amount/description validation for add-expense and edit-expense. */
export function isValidExpenseInput(amountCents: number, description: string): boolean {
  return amountCents > 0 && description.trim().length > 0;
}
