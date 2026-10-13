/**
 * "Invite by email" builds a `mailto:` that opens the organizer's OWN mail app (email-invites,
 * docs/features/email-invites/requirements.md). Splitiful sends nothing and stores no invitee
 * email: the address exists only in the browser, to fill the `to` field. Everything here is pure.
 */

/** Removes CR/LF and every other control character, so a trip or organizer name can't add a header or a recipient. */
export function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/ {2,}/g, " ").trim();
}

/**
 * Strict addr-spec for the `to` field: at most 254 characters, a local part of 1-64 RFC 5322 atext
 * characters and dots, then dot-separated hostname labels. Rejects display-name wrappers
 * (`x<y@z.com>`), quotes, commas and semicolons (extra recipients), brackets, whitespace and control
 * characters.
 */
export function isPlausibleEmail(email: string): boolean {
  const trimmed = email.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= 254 &&
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(trimmed)
  );
}

export type InviteMailInput = {
  /** The invitee's address, already checked with `isPlausibleEmail`. */
  to: string;
  organizerName: string;
  tripName: string;
  /** The trip's existing shared `/join/[code]` link. */
  joinUrl: string;
};

/** The final email copy (requirements: "Email copy (final, do not change)"). */
export function buildInviteMessage(input: InviteMailInput): { subject: string; body: string } {
  const organizer = stripControlChars(input.organizerName);
  const trip = stripControlChars(input.tripName);
  return {
    subject: `${organizer} invited you to ${trip} on Splitiful`,
    body: ["Hi there,", "", `I'm using Splitiful to split costs for ${trip}. Join here:`, input.joinUrl, "", organizer].join("\r\n"),
  };
}

/** Some mail clients and browsers drop or truncate mailto: URLs much past this. */
export const MAX_MAILTO_LENGTH = 1800;

/** Drops any lone surrogate (e.g. from input that was already cut mid-pair elsewhere) so encoding can't throw. */
function wellFormed(text: string): string {
  return text.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
}

function assembleMailto(input: InviteMailInput): string {
  const { subject, body } = buildInviteMessage(input);
  const to = encodeURIComponent(input.to.trim()).replace(/%40/g, "@");
  return `mailto:${to}?subject=${encodeURIComponent(wellFormed(subject))}&body=${encodeURIComponent(wellFormed(body))}`;
}

/**
 * RFC 6068: every value percent-encoded, line breaks as %0D%0A. Throws on an address that isn't
 * plausible. If the URL would pass `MAX_MAILTO_LENGTH` (long names that percent-encode heavily), the
 * organizer and trip names are shortened step by step; the address and the join link are never touched.
 */
export function buildInviteMailto(input: InviteMailInput): string {
  if (!isPlausibleEmail(input.to)) throw new Error("invalid email address");
  let url = assembleMailto(input);
  for (const limit of [40, 30, 20, 12, 6]) {
    if (url.length <= MAX_MAILTO_LENGTH) break;
    // By code point, never UTF-16 unit: slicing inside a surrogate pair leaves a lone surrogate,
    // and encodeURIComponent throws URIError on that.
    const cut = (name: string) => [...stripControlChars(name)].slice(0, limit).join("").trim();
    url = assembleMailto({
      ...input,
      organizerName: cut(input.organizerName),
      tripName: cut(input.tripName),
    });
  }
  return url;
}
