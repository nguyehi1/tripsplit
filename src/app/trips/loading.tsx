import { Screen, ScreenContent } from "@/components/ui";
import { DelayedLoadingLine } from "@/components/delayed-loading-line";

export default function Loading() {
  return (
    <Screen>
      <ScreenContent className="pt-0.5">
        <p className="px-1 text-[15px] text-ink/70">Loading your trips…</p>
        <DelayedLoadingLine className="px-1" />
      </ScreenContent>
    </Screen>
  );
}
