import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OTHER_TYPE_ALLOWED_CLASS,
  OTHER_TYPE_FIRST_CLASS,
  OTHER_TYPE_MAX_LENGTH,
  OTHER_TYPE_REGEX_FLAGS,
  normalizeOtherType,
  validateOtherType,
} from "./trip-type";

const ok = (s: string) => validateOtherType(s).ok;
const problem = (s: string) => {
  const r = validateOtherType(s);
  return r.ok ? null : r.problem;
};

describe("validateOtherType: accept matrix (criterion 65)", () => {
  it.each([
    ["Ski weekend"],
    ["Chuyen di Da Lat"],
    ["Cắm trại"], // Vietnamese, NFC
    ["Cắm trại"], // Vietnamese, NFD
    ["キャンプ"], // Japanese
    ["رحلة برية"], // Arabic
    ["ท่องเที่ยว"], // Thai with vowel/tone marks
    ["यात्रा"], // Devanagari with vowel signs
    ["Sam's trip & co, 2.5/3"],
    ["a".repeat(OTHER_TYPE_MAX_LENGTH)],
  ])("accepts %s", (s) => {
    expect(ok(s)).toBe(true);
  });

  it("returns the NFC form of NFD input", () => {
    const r = validateOtherType("Cắm trại");
    expect(r.ok && r.value).toBe("Cắm trại");
  });

  it("maps typographic apostrophes and dashes to ASCII", () => {
    const r = validateOtherType("Sam’s – trip");
    expect(r.ok && r.value).toBe("Sam's - trip");
  });
});

describe("validateOtherType: reject matrix (criterion 65)", () => {
  it.each([
    ["", "empty"],
    ["    ", "empty"],
    ["a".repeat(OTHER_TYPE_MAX_LENGTH + 1), "length"],
    ["<script>", "charset"],
    ["=1+1", "charset"],
    ["ski‮trip", "charset"],
    ["ski​trip", "charset"],
    ["ski͏trip", "charset"],
    ["ski­trip", "charset"],
    ["ski 🎿", "charset"], // astral emoji (surrogate pair)
    ["ski ❤️", "charset"],
    ["👨‍👩", "charset"], // ZWJ sequence
    ["ski\uD83C", "charset"], // lone surrogate
    ["(ski)", "charset"],
    ["ski@home", "charset"],
    ["-ski", "first"],
    ["'ski", "first"],
    ["́ski", "first"],
  ])("rejects %j as %s", (s, expected) => {
    expect(problem(s)).toBe(expected);
  });

  it("collapses newline, tab and NBSP into ordinary spaces instead of passing them through", () => {
    // The client cleans these up; the database rejects them raw (live suite).
    const r = validateOtherType("ski\n\t weekend");
    expect(r.ok && r.value).toBe("ski weekend");
  });

  it("runs the character check before the length check", () => {
    expect(problem("🎿".repeat(40))).toBe("charset");
  });

  it("does not echo the input in any problem string", () => {
    const r = validateOtherType("<b>secret</b>");
    expect(JSON.stringify(r)).not.toContain("secret");
  });
});

describe("normalizeOtherType", () => {
  it("trims, collapses whitespace and normalizes to NFC", () => {
    expect(normalizeOtherType("  Ski   weekend \n")).toBe("Ski weekend");
  });
});

describe("regex construction", () => {
  it("builds the regexes without the m and u flags", () => {
    expect(OTHER_TYPE_REGEX_FLAGS).not.toMatch(/[mu]/);
  });

  it("a trailing newline cannot slip past $ (no m semantics)", () => {
    expect(new RegExp(`^[${OTHER_TYPE_ALLOWED_CLASS}]+$`).test("ski\n")).toBe(false);
  });
});

describe("character class: BMP property test", () => {
  const allowed = new RegExp(`^[${OTHER_TYPE_ALLOWED_CLASS}]$`);
  const accepted: number[] = [];
  for (let cp = 0; cp <= 0xffff; cp++) {
    if (allowed.test(String.fromCharCode(cp))) accepted.push(cp);
  }

  it("accepts nothing in Cc, Cf, Zs (other than ASCII space), Zl, Zp, Co or Cs", () => {
    const bad = new RegExp("^[\\p{Cc}\\p{Cf}\\p{Zs}\\p{Zl}\\p{Zp}\\p{Co}\\p{Cs}]$", "u");
    const offenders = accepted.filter((cp) => cp !== 0x20 && bad.test(String.fromCharCode(cp)));
    expect(offenders.map((c) => c.toString(16))).toEqual([]);
  });

  it("accepts no Extended_Pictographic, Bidi_Control or Default_Ignorable code point", () => {
    const bad = new RegExp(
      "^[\\p{Extended_Pictographic}\\p{Bidi_Control}\\p{Default_Ignorable_Code_Point}]$",
      "u",
    );
    const offenders = accepted.filter((cp) => bad.test(String.fromCharCode(cp)));
    expect(offenders.map((c) => c.toString(16))).toEqual([]);
  });

  it("accepts none of the markup and formula characters", () => {
    for (const ch of "<>\"`\\{}[]|;=+@#%$^*~():?!") {
      expect(allowed.test(ch), ch).toBe(false);
    }
  });

  it("everything accepted stays accepted after NFC (nothing normalizes into a banned character)", () => {
    const offenders = accepted.filter((cp) => {
      const nfc = String.fromCharCode(cp).normalize("NFC");
      return ![...nfc].every((ch) => allowed.test(ch));
    });
    expect(offenders.map((c) => c.toString(16))).toEqual([]);
  });

  it("the first-character class is a subset of the allowed class", () => {
    const first = new RegExp(`^[${OTHER_TYPE_FIRST_CLASS}]$`);
    // One assertion after the loop: an expect() per code point is slow enough to time out.
    const notAllowed: string[] = [];
    for (let cp = 0; cp <= 0xffff; cp++) {
      const ch = String.fromCharCode(cp);
      if (first.test(ch) && !allowed.test(ch)) notAllowed.push(cp.toString(16));
    }
    expect(notAllowed).toEqual([]);
    for (const ch of " -'&,./́") expect(first.test(ch), ch).toBe(false);
  });

  it("reports the count of accepted unassigned (Cn) code points so a Unicode upgrade shows in review", () => {
    const cn = new RegExp("^\\p{Cn}$", "u");
    const count = accepted.filter((cp) => cn.test(String.fromCharCode(cp))).length;
    // Accepted risk (architecture.md section 3): unassigned points inside accepted ranges pass
    // the CHECK. The exact number depends on the Unicode version bundled with the running Node
    // (newer Unicode assigns more points, so it only shrinks), so it is a sanity bound, not a
    // snapshot that would fail on every machine with a different Node. Re-review the ranges if
    // the bound is ever exceeded.
    console.info(`accepted unassigned (Cn) BMP code points: ${count} (Unicode ${process.versions.unicode})`);
    expect(count).toBeLessThan(2000);
  });
});

describe("drift against the newest migration that defines trips_other_type_check", () => {
  const dir = join(__dirname, "../../../supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".verify.sql"))
    .sort();
  const newest = files.filter((f) => readFileSync(join(dir, f), "utf8").includes("trips_other_type_check")).pop();

  it("finds a defining migration", () => {
    expect(newest).toBeDefined();
  });

  it("uses exactly the class strings exported here", () => {
    const sql = readFileSync(join(dir, newest!), "utf8");
    const allowedMatch = sql.match(/other_type ~ '\^\[([^\]]+?)\]\+\$'/);
    const firstMatch = sql.match(/other_type ~ '\^\[([^\]]+?)\]'/);
    expect(allowedMatch, "allowed-class regex not found").not.toBeNull();
    expect(firstMatch, "first-character regex not found").not.toBeNull();
    expect(allowedMatch![1].replace(/''/g, "'")).toBe(OTHER_TYPE_ALLOWED_CLASS);
    expect(firstMatch![1].replace(/''/g, "'")).toBe(OTHER_TYPE_FIRST_CLASS);
  });
});
