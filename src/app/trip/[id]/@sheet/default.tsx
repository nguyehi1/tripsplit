/** Unmatched-slot fallback on hard reload (ADR 0008 point 2) — the sheet never gets "stuck"
 *  open on a hard navigation/refresh that doesn't itself target `/add-expense`. */
export default function Default() {
  return null;
}
