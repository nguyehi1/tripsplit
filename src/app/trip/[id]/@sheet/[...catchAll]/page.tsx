/** Matches navigating from the trip view to any *other* `/trip/[id]/*` subroute (settle-up,
 *  invite, feedback, edit-expense) without a `/trip/[id]` stop in between (ADR 0008 point 2) —
 *  same "otherwise stuck open" reason as `@sheet/page.tsx`. */
export default function SheetCatchAll() {
  return null;
}
