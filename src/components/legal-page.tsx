import Link from "next/link";
import type { ReactNode } from "react";
import { Screen, ScreenContent, TopBar } from "@/components/ui";
import { LEGAL_EFFECTIVE_DATE, LEGAL_LAST_UPDATED } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Screen>
      <ScreenContent>
        <TopBar title={title} leading={<Link href="/" className="text-[14px] text-ink/70">← Home</Link>} />
        <div className="h-4" />
        <p className="text-[12.5px] text-ink/[0.73]">
          Effective {LEGAL_EFFECTIVE_DATE} · Last updated {LEGAL_LAST_UPDATED}
        </p>
        <div className="mt-4 space-y-4 text-[14.5px] leading-[1.55] text-ink/[0.85] [&_h2]:mt-6 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_a]:underline">
          {children}
        </div>
      </ScreenContent>
    </Screen>
  );
}

export function LegalLinks() {
  return (
    <nav aria-label="Legal" className="flex justify-center gap-4 pt-6 text-[12.5px] text-ink/[0.73]">
      <Link href="/privacy" className="underline">Privacy</Link>
      <Link href="/terms" className="underline">Terms</Link>
    </nav>
  );
}
