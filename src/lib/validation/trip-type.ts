/**
 * Validation for the New trip form's "Other" trip type (a short typed label, stored in
 * `trips.other_type`). The database enforces the same rule in `trips_other_type_check`
 * (migration 0022); this module exists so the form never accepts something the database would
 * reject, and the drift test in `trip-type.test.ts` keeps the two character classes identical.
 *
 * The rule is a locale-independent code-point allowlist (Basic Multilingual Plane only), not
 * `\p{L}` or `[[:alpha:]]`: Postgres has no `\p{L}`, and its POSIX classes follow the database
 * collation. The class below is written with `\uXXXX` escapes, which both the Postgres regex
 * engine and JavaScript read the same way. Invisible and format characters are carved out by
 * omission; the property test in `trip-type.test.ts` is the arbiter when a range is tuned.
 *
 * The regexes are built without the `m` flag (so `$` is end-of-string only, as in Postgres, and
 * a trailing newline cannot slip through) and without the `u` flag (so astral characters, which
 * include every emoji, arrive as lone surrogates and are rejected). Changing either flag means
 * re-running the drift test.
 */

export const OTHER_TYPE_MAX_LENGTH = 30;

type Range = readonly [number, number];

/** Letters, combining marks and digits outside ASCII, as inclusive code-point ranges. */
const NON_ASCII_RANGES: readonly Range[] = [
  // Latin-1 letters
  [0x00aa, 0x00aa],
  [0x00b5, 0x00b5],
  [0x00ba, 0x00ba],
  [0x00c0, 0x00d6],
  [0x00d8, 0x00f6],
  // Latin, Greek, Cyrillic, Armenian, Hebrew (U+034F grapheme joiner, U+037E Greek question
  // mark and U+0387 ano teleia carved out: invisible, or canonically equal to ';' and U+00B7)
  [0x00f8, 0x034e],
  [0x0350, 0x037d],
  [0x037f, 0x0386],
  [0x0388, 0x05ff],
  // Arabic, Syriac, Thaana, Indic scripts, Thai, Lao, Tibetan, Myanmar, Georgian, Hangul Jamo,
  // Ethiopic, Cherokee, Canadian Aboriginal, Ogham, Runic, Khmer, Mongolian, extended Latin and
  // Greek. Format characters carved out: U+0600-0605, U+061C, U+06DD, U+070F, U+0890-0891,
  // U+08E2, U+115F-1160, U+1680, U+17B4-17B5, U+180B-180F. U+1FEF and U+1FFD are canonically
  // equal to '`' and U+00B4.
  [0x0606, 0x061b],
  [0x061d, 0x06dc],
  [0x06de, 0x070e],
  [0x0710, 0x088f],
  [0x0892, 0x08e1],
  [0x08e3, 0x115e],
  [0x1161, 0x167f],
  [0x1681, 0x17b3],
  [0x17b6, 0x180a],
  [0x1810, 0x1fee],
  [0x1ff0, 0x1ffc],
  [0x1ffe, 0x1fff],
  // Skips U+2000-U+2BFF: spaces, ZWSP/ZWJ, bidi controls, invisible operators, symbols, arrows,
  // dingbats and the emoji-era symbol blocks.
  [0x2c00, 0x2dff],
  [0x3005, 0x3007],
  [0x3041, 0x3096],
  [0x3099, 0x309f],
  [0x30a1, 0x30ff],
  [0x3105, 0x312f],
  [0x3131, 0x3163],
  [0x3165, 0x318e],
  [0x31a0, 0x31bf],
  [0x31f0, 0x31ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0xd7ff],
  // Skips surrogates and the private use area (U+D800-U+F8FF).
  // CJK compatibility ideographs, minus the seven that NFC maps outside the BMP
  // (U+FA6C, U+FACF, U+FAD0, U+FAD1, U+FAD5, U+FAD6, U+FAD7).
  [0xf900, 0xfa6b],
  [0xfa6d, 0xface],
  [0xfad2, 0xfad4],
  [0xfad8, 0xfd3d],
  [0xfd40, 0xfdcf],
  [0xfdf0, 0xfdfb],
  [0xfe20, 0xfe2f],
  [0xfe70, 0xfefc],
  [0xff10, 0xff19],
  [0xff21, 0xff3a],
  [0xff41, 0xff5a],
  [0xff66, 0xff9f],
  [0xffa1, 0xffdc],
];

/** Combining-mark blocks: allowed inside the text (Vietnamese NFD) but not as the first character. */
const COMBINING_BLOCKS: readonly Range[] = [
  [0x0300, 0x036f],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0xfe20, 0xfe2f],
];

function subtract(ranges: readonly Range[], cut: readonly Range[]): Range[] {
  let out: Range[] = ranges.map((r) => [r[0], r[1]]);
  for (const [cutLo, cutHi] of cut) {
    const next: Range[] = [];
    for (const [lo, hi] of out) {
      if (cutHi < lo || cutLo > hi) {
        next.push([lo, hi]);
        continue;
      }
      if (cutLo > lo) next.push([lo, cutLo - 1]);
      if (cutHi < hi) next.push([cutHi + 1, hi]);
    }
    out = next;
  }
  return out;
}

const hex = (n: number) => `\\u${n.toString(16).toUpperCase().padStart(4, "0")}`;

function rangesToClassBody(ranges: readonly Range[]): string {
  return ranges.map(([lo, hi]) => (lo === hi ? hex(lo) : `${hex(lo)}-${hex(hi)}`)).join("");
}

const LETTERS_AND_DIGITS = "A-Za-z0-9";
// ASCII space and the punctuation criterion 64 allows. The hyphen goes last so it is literal.
const ASCII_PUNCTUATION = " &,./'-";

/** Bracket-expression body for every allowed character, shared byte-for-byte with the migration. */
export const OTHER_TYPE_ALLOWED_CLASS =
  LETTERS_AND_DIGITS + rangesToClassBody(NON_ASCII_RANGES) + ASCII_PUNCTUATION;

/** Same, minus ASCII punctuation, space and bare combining marks: what the first character may be. */
export const OTHER_TYPE_FIRST_CLASS =
  LETTERS_AND_DIGITS + rangesToClassBody(subtract(NON_ASCII_RANGES, COMBINING_BLOCKS));

const ALLOWED_ALL = new RegExp(`^[${OTHER_TYPE_ALLOWED_CLASS}]+$`);
const FIRST_OK = new RegExp(`^[${OTHER_TYPE_FIRST_CLASS}]`);
const ALLOWED_ONE = new RegExp(`^[${OTHER_TYPE_ALLOWED_CLASS}]`);

/** Exposed for the drift test, which asserts neither the `m` nor the `u` flag is ever set. */
export const OTHER_TYPE_REGEX_FLAGS = ALLOWED_ALL.flags + FIRST_OK.flags;

/**
 * Silent clean-up applied before validation: typographic apostrophes and dashes become their
 * ASCII equivalents (an iPhone types U+2019 in "Sam's trip"), runs of whitespace (including
 * pasted tabs and newlines) collapse to one space, the ends are trimmed, and the result is NFC.
 */
export function normalizeOtherType(raw: string): string {
  return raw
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
}

export type OtherTypeProblem = "empty" | "first" | "charset" | "length";

export type OtherTypeResult = { ok: true; value: string } | { ok: false; problem: OtherTypeProblem };

/**
 * Normalizes, then validates. The character checks run before the length check so a lone
 * surrogate or an astral emoji gets the charset message. The result never echoes the input.
 */
export function validateOtherType(raw: string): OtherTypeResult {
  const value = normalizeOtherType(raw);
  if (value.length === 0) return { ok: false, problem: "empty" };
  if (!FIRST_OK.test(value)) {
    // A character the database allows, but not at the start (punctuation, a bare combining
    // mark), gets the "start with" message; anything else gets the charset message.
    return { ok: false, problem: ALLOWED_ONE.test(value) ? "first" : "charset" };
  }
  if (!ALLOWED_ALL.test(value)) return { ok: false, problem: "charset" };
  if (value.length > OTHER_TYPE_MAX_LENGTH) return { ok: false, problem: "length" };
  return { ok: true, value };
}

/** Fixed form copy for each problem; never quotes what the user typed. */
export const OTHER_TYPE_PROBLEM_COPY: Record<OtherTypeProblem, string> = {
  empty: "Type a trip type, or untick Other.",
  first: "Start with a letter or number.",
  charset: "Use letters, numbers, spaces and - ' & , . / only.",
  length: `Use ${OTHER_TYPE_MAX_LENGTH} characters or fewer.`,
};
