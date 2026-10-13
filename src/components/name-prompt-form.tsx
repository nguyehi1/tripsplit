"use client";

import { useState, type ReactNode } from "react";
import { Button, Field, Screen, ScreenContent, TopBar } from "@/components/ui";

/**
 * The one "what should everyone call you?" form (email-invites design.md section 10 item 1),
 * extracted from `/check-email`'s full-screen name step and `InlineVerifyWidget`'s needs-name
 * card, and reused by the roster's name-first card and the `/invite/<token>` post-join prompt.
 *
 * - `variant="screen"`: a whole screen (TopBar "One last thing" + display headline).
 * - `variant="card"`: just the title, field and button — the caller supplies the container
 *   (the accent-soft panel on the trip page, a `Card` on the roster).
 *
 * `onSubmit` receives the trimmed name and does the actual work (set_my_display_name, or a join).
 * The pending label stays up after a successful submit — every caller navigates or unmounts this
 * form on success — and resets only on error.
 *
 * Never prefilled: since migration 0020 the account name applies across all trips, so an
 * organizer-typed invitee name like "Dad" must not become this person's name everywhere (AC23).
 */
export function NamePromptForm({
  variant,
  title,
  ctaLabel,
  pendingLabel = "Saving…",
  ctaIcon,
  onSubmit,
  errorMessage = () => "Couldn't save your name — try again.",
  inputClassName,
}: {
  variant: "screen" | "card";
  /** Card variant only; the screen variant always asks "What should everyone call you?". */
  title?: ReactNode;
  ctaLabel: string;
  pendingLabel?: string;
  ctaIcon?: ReactNode;
  onSubmit: (name: string) => Promise<void>;
  errorMessage?: (e: unknown) => string;
  /** E.g. a tinted input when the form sits inside a white `Card`, where `Field`'s white input would vanish. */
  inputClassName?: string;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Enter your name first.");
      return;
    }
    // Same 1–50 limit set_my_display_name enforces, so the user gets our copy, not the DB's.
    if (name.trim().length > 50) {
      setError("Keep your name to 50 characters or fewer.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  const field = (
    <Field
      label="Your name"
      hint="how others on the trip will see you"
      placeholder="e.g. Alex"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSubmit();
      }}
      inputClassName={inputClassName}
    />
  );
  const errorLine = error ? <p className="mt-2 text-[13px] text-terracotta">{error}</p> : null;

  if (variant === "screen") {
    return (
      <Screen>
        <ScreenContent className="pt-8">
          <TopBar title="One last thing" />
          <div className="h-6" />
          <h1 className="text-display text-[34px]">What should everyone call you?</h1>
          <div className="h-7" />
          {field}
          {errorLine}
          <div className="h-2.5" />
          <Button variant="accent" className="text-[16px]" onClick={handleSubmit} disabled={saving}>
            {saving ? pendingLabel : ctaLabel}
            {saving ? null : ctaIcon}
          </Button>
        </ScreenContent>
      </Screen>
    );
  }

  return (
    <>
      {title ? (
        <>
          <div className="text-[15px] font-semibold leading-[1.35]">{title}</div>
          <div className="h-3" />
        </>
      ) : null}
      {field}
      {errorLine}
      <div className="h-2.5" />
      <Button variant="accent" className="text-[15px]" onClick={handleSubmit} disabled={saving}>
        {saving ? pendingLabel : ctaLabel}
        {saving ? null : ctaIcon}
      </Button>
    </>
  );
}
