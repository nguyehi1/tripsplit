"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CloseIcon } from "@/components/icons";
import { Button, BottomBar, Field, IconButton, Screen, ScreenContent, TopBar } from "@/components/ui";
import { extractInviteCode } from "@/lib/invite-code";

/**
 * Manual invite-code entry screen (docs/features/ux-revamp/requirements.md AC17). Replaces the
 * native `window.prompt("Paste your invite link or code")` that used to back Welcome's "I have
 * an invite link" button — styled like Create-a-trip (`trip/new/page.tsx`), the closest existing
 * small single-field form screen post-restyle. Reuses `extractInviteCode` unchanged and routes
 * into the existing `/join/[code]` destination, which is untouched by this screen.
 *
 * No Miso placement here (AC17's note — not one of the four AC13 mascot-bearing screens).
 */
export default function JoinPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleContinue() {
    if (!value.trim()) {
      setError("Paste your invite link or code first.");
      return;
    }
    setError(null);
    router.push(`/join/${extractInviteCode(value)}`);
  }

  return (
    <Screen glow texture>
      <ScreenContent>
        <TopBar
          sticky
          title="Join a trip"
          leading={
            // Always navigates to "/" rather than router.back(), since this screen may be
            // reached directly (e.g. a fresh tab) and should always have a safe way out.
            // `replace`, not `push` — closing shouldn't leave a "/join" entry sitting between
            // "/" and wherever the user was before, which would otherwise take an extra
            // back-press to clear (QA finding, pass 4).
            <IconButton aria-label="Close" onClick={() => router.replace("/")}>
              <CloseIcon size={18} strokeWidth={2.3} />
            </IconButton>
          }
        />
        <div className="h-4" />
        <h1 className="text-display text-[30px]">
          Got an
          <br />
          invite?
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[290px] text-[15px] leading-[1.5] text-ink/[0.73]">
          Paste the link someone sent you, or just the code.
        </p>
        <div className="h-7" />

        <Field
          label="Invite link or code"
          placeholder="splitiful.app/join/abc123 or abc123"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error ? <p className="mt-2 text-[13px] text-terracotta">{error}</p> : null}
      </ScreenContent>
      <BottomBar>
        <Button variant="capsule" className="text-[16px]" onClick={handleContinue}>
          Continue
        </Button>
      </BottomBar>
    </Screen>
  );
}
