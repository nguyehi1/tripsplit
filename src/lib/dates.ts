export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Today's calendar date in the browser's local timezone, as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Mon, 9/14" — weekday + numeric date, replacing the old weekday-only expense-list label. */
export function formatDayDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const date = d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  return `${weekday}, ${date}`;
}

export function formatDateRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return null;
  if (startsOn && endsOn) {
    const start = new Date(`${startsOn}T00:00:00`);
    const end = new Date(`${endsOn}T00:00:00`);
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endLabel = sameMonth
      ? end.toLocaleDateString("en-US", { day: "numeric" })
      : end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  return formatDate(startsOn ?? endsOn!);
}
