import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRightIcon, InfoIcon, LockIcon, MessageSquareIcon } from "@/components/icons";
import { HomeNavBar } from "@/components/bottom-nav-bar";
import { Card, Divider, Screen, ScreenContent, TopBar } from "@/components/ui";
import { getMyDisplayName } from "@/lib/data/trips";
import { createClient } from "@/lib/supabase/server";
import { YouIdentityCard } from "./you-identity-card";

/**
 * Board O (requirements item 4; design.md §4.6) — a new screen, not a restyle: Privacy and Terms
 * move here from `/trips` and Welcome's inline `LegalLinks` (design.md §0 item 2), as full rows
 * rather than the centered link pair they were. See `src/proxy.ts` for this route's session gate
 * (added alongside this page, same PR, per architecture.md §3.7's ordering note).
 */
export const dynamic = "force-dynamic";

export default async function YouPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Defensive fallback only — src/proxy.ts already redirects unauthenticated visitors before
  // this page renders (same pattern as /trips).
  if (!user) redirect("/");

  let name: string | null = null;
  try {
    name = await getMyDisplayName(supabase);
  } catch {
    name = null;
  }

  return (
    <Screen glow texture>
      <ScreenContent className="pt-0.5" padding="px-4">
        <TopBar title="You" titleClassName="text-display text-[28px]" />
        <div className="h-4" />
        <YouIdentityCard initialName={name} />
        <div className="h-4" />
        <Card className="px-4 py-[3px]">
          <Link href="/privacy" className="flex items-center gap-3 py-[11px]">
            <span
              aria-hidden="true"
              className="flex size-9 flex-none items-center justify-center rounded-[11px]"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
            >
              <LockIcon size={17} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold">Privacy</span>
            <ChevronRightIcon size={17} strokeWidth={2.2} className="flex-none text-muted" />
          </Link>
          <Divider className="bg-hairline" />
          <Link href="/terms" className="flex items-center gap-3 py-[11px]">
            <span
              aria-hidden="true"
              className="flex size-9 flex-none items-center justify-center rounded-[11px]"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
            >
              <InfoIcon size={17} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold">Terms</span>
            <ChevronRightIcon size={17} strokeWidth={2.2} className="flex-none text-muted" />
          </Link>
          <Divider className="bg-hairline" />
          <Link href="/feedback" className="flex items-center gap-3 py-[11px]">
            <span
              aria-hidden="true"
              className="flex size-9 flex-none items-center justify-center rounded-[11px]"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent-ink)" }}
            >
              <MessageSquareIcon size={17} strokeWidth={2.2} />
            </span>
            <span className="min-w-0 flex-1 text-[15px] font-semibold">Send feedback</span>
            <ChevronRightIcon size={17} strokeWidth={2.2} className="flex-none text-muted" />
          </Link>
        </Card>
        <div aria-hidden className="h-[72px]" />
      </ScreenContent>
      <HomeNavBar />
    </Screen>
  );
}
