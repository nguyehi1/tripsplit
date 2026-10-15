import { describe, expect, it } from "vitest";
import { STARTER_TYPES } from "./starter-catalog";
import {
  deriveSuggestions,
  HOME_BLANK_TRIP_EVENT,
  homeTemplateTappedEvent,
  isTripType,
  parseTypeParam,
  sentencePhrases,
  tripTypeSelectedEvent,
} from "./starter-suggestions";

const names = (types: string[], existing: string[] = []) => deriveSuggestions(types, existing).map((s) => s.name);

describe("deriveSuggestions", () => {
  it("returns nothing for no types and for unknown codes", () => {
    expect(names([])).toEqual([]);
    expect(names(["other", "bogus"])).toEqual([]);
  });

  it("shows a name once when two picked types share it, labelled with the first type picked", () => {
    const camp = deriveSuggestions(["camping", "airbnb"], []);
    const airFirst = deriveSuggestions(["airbnb", "camping"], []);
    expect(camp.filter((s) => s.name === "Trash bags")).toEqual([
      { name: "Trash bags", sourceCode: "camping", sourceLabel: "Camping" },
    ]);
    expect(airFirst.find((s) => s.name === "Trash bags")?.sourceLabel).toBe("Airbnb stay");
  });

  it("de-duplicates against the list on lowercase, trimmed names, whatever the item status", () => {
    const rest = names(["camping"], ["  campsite fee ", "ICE"]);
    expect(rest).not.toContain("Campsite fee");
    expect(rest).not.toContain("Ice");
    expect(rest).toContain("Firewood");
  });

  it("brings a deleted item back (nothing is remembered)", () => {
    expect(names(["camping"], ["Campsite fee"])).not.toContain("Campsite fee");
    expect(names(["camping"], [])).toContain("Campsite fee");
  });

  it("returns the whole catalog for one type", () => {
    expect(names(["international"])).toEqual([...STARTER_TYPES.find((t) => t.code === "international")!.items]);
  });
});

describe("sentencePhrases / events", () => {
  it("joins phrases in pick order and ignores non-catalog codes", () => {
    expect(sentencePhrases([])).toBe("");
    expect(sentencePhrases(["camping"])).toBe("camping");
    expect(sentencePhrases(["airbnb", "international"])).toBe("an Airbnb stay and international travel");
    expect(sentencePhrases(["camping", "airbnb", "international"])).toBe(
      "camping, an Airbnb stay and international travel",
    );
    expect(sentencePhrases(["other"])).toBe("");
  });

  it("builds event names only for catalog codes", () => {
    expect(tripTypeSelectedEvent("camping")).toBe("trip_type_selected_camping");
    expect(tripTypeSelectedEvent("other")).toBeUndefined();
    expect(tripTypeSelectedEvent("ski weekend")).toBeUndefined();
    expect(isTripType("airbnb")).toBe(true);
    expect(isTripType("other")).toBe(false);
  });
});

describe("homeTemplateTappedEvent (closed set)", () => {
  it("names the catalog codes only", () => {
    for (const t of STARTER_TYPES) expect(homeTemplateTappedEvent(t.code)).toBe(`home_template_tapped_${t.code}`);
    for (const bad of ["other", "", "Camping", "camping ", "__proto__", "constructor", "toString"]) {
      expect(homeTemplateTappedEvent(bad), bad).toBeUndefined();
    }
    expect(HOME_BLANK_TRIP_EVENT).toBe("home_blank_trip_tapped");
  });
});

describe("parseTypeParam", () => {
  it("accepts only an exact single catalog code", () => {
    for (const t of STARTER_TYPES) expect(parseTypeParam(t.code)).toBe(t.code);
  });

  it("ignores everything else, without trimming, lowercasing or taking the first array element", () => {
    const junk: unknown[] = [
      undefined,
      null,
      "",
      "Camping",
      "CAMPING",
      "camping ",
      " camping",
      "other",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      ["camping"],
      ["camping", "junk"],
      42,
      {},
      { code: "camping" },
      "<script>alert(1)</script>",
      "%E0%A4%A",
      "camping&type=airbnb",
    ];
    for (const raw of junk) expect(parseTypeParam(raw), JSON.stringify(raw)).toBeUndefined();
  });
});
