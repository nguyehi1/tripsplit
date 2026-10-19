"use client";

import { useState } from "react";
import { UserIcon } from "@/components/icons";
import { NamePromptForm } from "@/components/name-prompt-form";
import { Card } from "@/components/ui";
import { setMyDisplayName } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/client";

/**
 * The You screen's identity row (design.md §4.6) — "no new account-settings behavior is being
 * designed here" (requirements item 4, board O), so this reuses `NamePromptForm`'s existing
 * editable-name pattern verbatim when no name is set yet, otherwise just shows it. `initialName`
 * comes from the server page's own `getMyDisplayName` call; this component owns nothing beyond
 * reflecting a successful save back into view without a full reload.
 */
export function YouIdentityCard({ initialName }: { initialName: string | null }) {
  const [name, setName] = useState(initialName);

  if (!name) {
    return (
      <Card className="p-4">
        <NamePromptForm
          variant="card"
          title="What should everyone call you?"
          ctaLabel="Save"
          onSubmit={async (value) => {
            await setMyDisplayName(createClient(), value);
            setName(value);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-10 flex-none items-center justify-center rounded-full bg-tint text-muted">
        <UserIcon size={18} strokeWidth={2.2} />
      </span>
      <div>
        <div className="text-[12px] text-muted">Your name</div>
        <div className="text-[15px] font-semibold">{name}</div>
      </div>
    </Card>
  );
}
