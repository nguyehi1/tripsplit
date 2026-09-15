export type AvatarColor = { bg: string; fg: string };

const ORGANIZER_COLOR: AvatarColor = { bg: "oklch(0.45 0.09 80)", fg: "#fff" };

// Light tints from the same palette used elsewhere in the app, cycled by join order.
const MEMBER_PALETTE: AvatarColor[] = [
  { bg: "oklch(0.87 0.08 88)", fg: "#231c12" },
  { bg: "oklch(0.86 0.07 44)", fg: "#231c12" },
  { bg: "oklch(0.93 0.03 88)", fg: "#231c12" },
  { bg: "oklch(0.92 0.045 44)", fg: "#231c12" },
  { bg: "oklch(0.9 0.05 130)", fg: "#231c12" },
  { bg: "oklch(0.88 0.05 220)", fg: "#231c12" },
];

/** memberIndex is position in join order (0 = first to join). */
export function avatarColorFor(memberIndex: number, isOrganizer: boolean): AvatarColor {
  return isOrganizer ? ORGANIZER_COLOR : MEMBER_PALETTE[memberIndex % MEMBER_PALETTE.length];
}

export function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * The one place "{name} (placeholder)" gets built, so every display site (payer picker, Details
 * table, Summary/settle-up, roster) renders it identically — see
 * docs/features/add-placeholder-members/requirements.md AC5. Never bake this into the raw
 * `displayName` field itself: `initialsFor(displayName)` and rename/edit flows need the
 * unadorned name.
 */
export function displayNameFor(displayName: string, isPlaceholder: boolean): string {
  return isPlaceholder ? `${displayName} (placeholder)` : displayName;
}
