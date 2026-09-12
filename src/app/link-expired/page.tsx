"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, ArrowRightIcon } from "@/components/icons";
import { BottomBar, Button, Screen, ScreenContent } from "@/components/ui";

function LinkExpiredContent() {
  const router = useRouter();
  const next = useSearchParams().get("next");

  return (
    <Screen>
      <ScreenContent className="pt-[70px]">
        <div
          className="flex size-[46px] items-center justify-center rounded-[16px]"
          style={{ background: "oklch(0.95 0.035 44)", color: "oklch(0.4 0.09 44)" }}
        >
          <AlertTriangleIcon size={24} strokeWidth={2.1} />
        </div>
        <div className="h-5" />
        <h1 className="text-display text-[34px]">
          That link&apos;s
          <br />
          done its job.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          Sign-in links expire after 15 minutes, can only be used once, and only work in the
          browser you requested them from. Enter your email again to get a fresh one.
        </p>
      </ScreenContent>
      <BottomBar>
        <Button
          variant="primary"
          className="text-[16px]"
          onClick={() => router.push(next ? `/?next=${encodeURIComponent(next)}` : "/")}
        >
          Enter your email again
          <ArrowRightIcon size={18} strokeWidth={2.4} />
        </Button>
      </BottomBar>
    </Screen>
  );
}

export default function LinkExpiredPage() {
  return (
    <Suspense>
      <LinkExpiredContent />
    </Suspense>
  );
}
