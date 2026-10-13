import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarStack } from "@/components/ui";
import { TripTabProvider } from "./trip-tab-context";
import { TripTabs } from "./trip-tabs";

/**
 * QA regression (email-invites branch UI tweaks): pending invitees add rows to every member list,
 * so the trips-list AvatarStack is capped at 5 (+N chip) and the trip page's Details tab shows at
 * most 5 people until "show all".
 */

function member(i: number, extra: Record<string, unknown> = {}) {
  return {
    id: `m${i}`,
    displayName: `Person ${i}`,
    joinedAt: "2026-01-01",
    isOrganizer: i === 0,
    isPlaceholder: false,
    initials: `P${i}`,
    avatar: { bg: "#fff", fg: "#000" },
    paidCents: 0,
    shareCents: 0,
    netCents: 0,
    expenseCount: 0,
    ...extra,
  };
}

function renderDetails(count: number) {
  const members = Array.from({ length: count }, (_, i) => member(i));
  return renderToStaticMarkup(
    <TripTabProvider initialTab="details">
      <TripTabs
        tripId="trip-1"
        members={members as never}
        expenses={[]}
        you={members[0] as never}
        isCompleted={false}
        shoppingList={null}
      />
    </TripTabProvider>,
  );
}

describe("AvatarStack cap", () => {
  it("shows every avatar up to 5, with no overflow chip", () => {
    const html = renderToStaticMarkup(<AvatarStack members={Array.from({ length: 5 }, (_, i) => member(i))} />);
    for (let i = 0; i < 5; i++) expect(html).toContain(`P${i}`);
    expect(html).not.toContain("+");
  });

  it("collapses the overflow into one +N chip", () => {
    const html = renderToStaticMarkup(<AvatarStack members={Array.from({ length: 12 }, (_, i) => member(i))} />);
    expect(html).toContain("P4");
    expect(html).not.toContain("P5");
    expect(html).toContain("+7");
  });
});

describe("Details tab 'show all'", () => {
  it("5 people: everyone, no 'show all'", () => {
    const html = renderDetails(5);
    expect(html).toContain("Person 4");
    expect(html).not.toContain("show all");
  });

  it("8 people: the first 5 and '+3 more people — show all'", () => {
    const html = renderDetails(8);
    expect(html).toContain("Person 4");
    expect(html).not.toContain("Person 5");
    expect(html).toContain("+3 more people — show all");
  });

  it("6 people: singular 'person'", () => {
    expect(renderDetails(6)).toContain("+1 more person — show all");
  });
});
