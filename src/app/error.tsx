"use client";

import { useEffect } from "react";
import { AlertTriangleIcon, ArrowRightIcon } from "@/components/icons";
import { Button, Screen, ScreenContent } from "@/components/ui";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
          Something
          <br />
          went wrong.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          That&apos;s on us. Give it another try — if it keeps happening, come back in a bit.
        </p>
        <div className="h-[22px]" />
        <Button variant="primary" block={false} className="px-6 text-[16px]" onClick={retry}>
          Try again
          <ArrowRightIcon size={18} strokeWidth={2.4} />
        </Button>
      </ScreenContent>
    </Screen>
  );
}
