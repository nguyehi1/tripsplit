import { todayIso } from "@/lib/dates";

/** Shared amount/description validation for add-expense and edit-expense. */
export function isValidExpenseInput(amountCents: number, description: string): boolean {
  return amountCents > 0 && description.trim().length > 0;
}

/** A real calendar date, not in the future. Call only when a date string is present — the
 *  add-expense form's blank state (→ defaults to today) is valid and not this function's concern. */
export function isValidExpenseDate(dateIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return false;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;

  const [year, month, day] = dateIso.split("-").map(Number);
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return false;

  return dateIso <= todayIso();
}
