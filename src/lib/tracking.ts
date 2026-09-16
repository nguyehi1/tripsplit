"use client";

import { track } from "@vercel/analytics";

/**
 * Safely track a custom analytics event.
 * - Runs only in Client Components.
 * - Silently fails if Vercel Analytics is unavailable (privacy settings, build issues, etc.).
 * - Event name only; no custom fields to avoid PII risks.
 */
export function trackEvent(eventName: string): void {
  try {
    track(eventName);
  } catch {
    // Silently ignore: analytics unavailable, or other transient errors.
    // This should never throw in production, but we guard defensively.
  }
}
