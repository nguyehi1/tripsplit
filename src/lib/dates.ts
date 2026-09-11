export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
