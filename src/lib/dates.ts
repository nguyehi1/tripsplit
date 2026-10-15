// All three formatters below deliberately parse *and* format against a fixed "UTC" zone.
// These dates have no time-of-day component, so UTC is an arbitrary but consistent anchor —
// the two halves (parse, format) must always agree on the same zone, or a caller running in a
// zone other than that anchor will read back the wrong calendar day. This matters because these
// functions can now run server-side (SSR, effectively UTC) as well as client-side (the visitor's
// local zone) — see ADR 0005 and docs/features/ssr-trip-pages/architecture.md.
export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Today's calendar date in the browser's local timezone, as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Mon, 9/14" — weekday + numeric date, replacing the old weekday-only expense-list label. */
export function formatDayDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const date = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" });
  return `${weekday}, ${date}`;
}

/**
 * The compact range on a /trips row (design.md 16.1): "Feb 14–17" when both ends share a month
 * (en dash, no spaces), "Dec 28 – Jan 2" when they differ, one date alone otherwise, and null
 * when the trip has no dates. `formatDateRange` below is unchanged for every other screen.
 */
export function formatDateRangeCompact(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return null;
  if (startsOn && endsOn) {
    const startLabel = formatDate(startsOn);
    if (startsOn === endsOn) return startLabel;
    const start = new Date(`${startsOn}T00:00:00Z`);
    const end = new Date(`${endsOn}T00:00:00Z`);
    const sameMonth =
      start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
    return sameMonth
      ? `${startLabel}–${end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })}`
      : `${startLabel} – ${formatDate(endsOn)}`;
  }
  return formatDate(startsOn ?? endsOn!);
}

export function formatDateRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return null;
  if (startsOn && endsOn) {
    const start = new Date(`${startsOn}T00:00:00Z`);
    const end = new Date(`${endsOn}T00:00:00Z`);
    const sameMonth =
      start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
    const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const endLabel = sameMonth
      ? end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })
      : end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${startLabel} – ${endLabel}`;
  }
  return formatDate(startsOn ?? endsOn!);
}
