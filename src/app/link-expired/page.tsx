"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, ArrowRightIcon } from "@/components/icons";
import { BottomBar, Button, Card, Kicker, Screen, ScreenContent } from "@/components/ui";

function LinkExpiredContent() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "ana@email.com";

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
          Sign-in links expire after 15 minutes and can only be used once. Send yourself a fresh
          one.
        </p>
        <div className="h-[22px]" />
        <Kicker>Email</Kicker>
        <div className="h-1.5" />
        <Card className="flex h-[54px] items-center px-[18px] text-[16px] font-medium">{email}</Card>
      </ScreenContent>
      <BottomBar>
        <Button
          variant="primary"
          className="text-[16px]"
          onClick={() => router.push(`/check-email?email=${encodeURIComponent(email)}`)}
        >
          Send a new link
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
