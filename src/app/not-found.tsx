import Link from "next/link";
import { InfoIcon } from "@/components/icons";
import { Screen, ScreenContent } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen>
      <ScreenContent className="pt-[70px]">
        <div
          className="flex size-[46px] items-center justify-center rounded-[16px]"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <InfoIcon size={24} strokeWidth={2.1} />
        </div>
        <div className="h-5" />
        <h1 className="text-display text-[34px]">
          Nothing
          <br />
          here.
        </h1>
        <div className="h-3.5" />
        <p className="max-w-[295px] text-[14.5px] leading-[1.5] text-ink/[0.73]">
          This page doesn&apos;t exist, or the link is out of date.
        </p>
        <div className="h-[22px]" />
        <Link
          href="/"
          className="flex h-14 w-fit items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white"
        >
          Go home
        </Link>
      </ScreenContent>
    </Screen>
  );
}
