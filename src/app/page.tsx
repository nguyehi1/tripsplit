import { redirect } from "next/navigation";
import { Screen } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { HomeScreen } from "./home-screen";

/**
 * Session-aware routing for `/` (design.md section 7) — done server-side, before paint, so a
 * returning visitor with a session never sees a flash of welcome content before being routed
 * into their trip(s) (design.md section 2's explicit "avoid a flash" note). `?signin=1` forces
 * the welcome content to stay (the "no browser memory" sign-in path, design.md section 8) even
 * if a session happens to exist, since that link is meant to always be reachable from `/`.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ signin?: string }>;
}) {
  const { signin } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && signin !== "1") {
    const isAnonymous = user.is_anonymous === true;
    const { data: memberships } = await supabase.from("trip_members").select("trip_id").eq("user_id", user.id);
    const tripIds = new Set((memberships ?? []).map((m) => m.trip_id));

    if (tripIds.size === 1) {
      redirect(`/trip/${[...tripIds][0]}`);
    }
    if (!isAnonymous || tripIds.size >= 2) {
      redirect("/trips");
    }
    // Anonymous session owning 0 trips (e.g. a cleared-then-restored partial state) falls
    // through to the welcome screen below — same as no session at all (design.md section 7).
  }

  const showSignIn = signin === "1";

  return (
    <Screen glow texture={!showSignIn}>
      <HomeScreen showSignIn={showSignIn} />
    </Screen>
  );
}
