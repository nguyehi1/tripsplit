/** Matches a client-side `<Link>` back to the bare `/trip/[id]` (ADR 0008 point 2) — needed
 *  alongside `default.tsx` because parallel-route soft navigation otherwise keeps a slot's last
 *  active content even once the URL no longer implies it (see the parallel-routes doc's
 *  "closing the modal" example). */
export default function Sheet() {
  return null;
}
