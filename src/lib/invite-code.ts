/**
 * Shared by the `/join` manual-entry screen (docs/features/ux-revamp/requirements.md AC17):
 * accepts either a full invite link (anything containing `/join/<code>`) or a bare code, and
 * returns just the code. Previously lived inline in `home-screen.tsx`; moved here unchanged when
 * the native `window.prompt()` entry point was replaced with the `/join` screen, since it's no
 * longer specific to that file.
 */
export function extractInviteCode(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#\s]+)/);
  return match ? match[1] : trimmed;
}
