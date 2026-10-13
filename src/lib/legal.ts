/** Single source for the contact address, dates and operator details shown on the /privacy and /terms pages. */
export const PRIVACY_EMAIL = "Splitiful@gmail.com";
export const LEGAL_EFFECTIVE_DATE = "October 1, 2026";
/** Bump whenever the text of either page changes materially or otherwise. */
export const LEGAL_LAST_UPDATED = "October 12, 2026";
/** Days of inactivity before an unverified anonymous account is auto-deleted (migration 0018). */
export const ANON_RETENTION_DAYS = 90;
/** Days we aim to answer privacy requests within (runbook: docs/runbooks/account-deletion-and-export.md). */
export const REQUEST_RESPONSE_DAYS = 30;
/** Minimum age to use Splitiful. Matches the "not directed at children under 13" policy text. Counsel to confirm (some EU states use 16). */
export const MIN_AGE = 13;

/* Operator details rendered on /privacy and /terms. Update if Splitiful moves to an LLC (see compliance notes). */
/** Legal name of the person or company that operates Splitiful (the "controller"). */
export const OPERATOR_NAME = "Hien Nguyen";
/** Jurisdiction whose law governs the Terms, e.g. "the State of California, USA". */
export const GOVERNING_LAW = "the State of California, USA";
/** Courts / venue for disputes, e.g. "the state and federal courts located in San Francisco County, California". */
export const DISPUTE_VENUE = "the state and federal courts located in San Francisco County, California";
