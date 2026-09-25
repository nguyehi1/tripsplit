import { Screen, ScreenContent } from "@/components/ui";
import { DelayedLoadingLine } from "@/components/delayed-loading-line";

export default function Loading() {
  return (
    <Screen>
      <ScreenContent className="pt-14">
        <p className="text-[15px] text-ink/70">Loading your trip…</p>
        <DelayedLoadingLine />
      </ScreenContent>
    </Screen>
  );
}
