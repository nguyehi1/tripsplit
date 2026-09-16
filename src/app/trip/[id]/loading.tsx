import { Screen, ScreenContent } from "@/components/ui";

export default function Loading() {
  return (
    <Screen>
      <ScreenContent className="pt-14">
        <p className="text-[15px] text-ink/70">Loading your trip…</p>
      </ScreenContent>
    </Screen>
  );
}
