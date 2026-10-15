import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STARTER_TYPES } from "./starter-catalog";
import { LEGAL_LAST_UPDATED } from "./legal";

const root = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const norm = (s: string) => s.replace(/\s+/g, " ");

describe("Revision 3: docs and tokens", () => {
  const analytics = read("docs/ANALYTICS.md");

  it("ANALYTICS.md has a home_template_tapped row per catalog code, plus the blank-trip row", () => {
    for (const t of STARTER_TYPES) {
      expect(analytics).toMatch(new RegExp(`\\| \`home_template_tapped_${t.code}\` \\|`));
    }
    expect(analytics).toMatch(/\| `home_blank_trip_tapped` \|/);
    expect(analytics).not.toMatch(/\| `home_template_tapped_other` \|/);
  });

  it("ANALYTICS.md says the events fire on the tap, before navigation, with no account, and are a closed set", () => {
    const section = norm(analytics.slice(analytics.indexOf("### Home and templates"), analytics.indexOf("### Expense Management")));
    expect(section).toContain("on the tap, before navigation, with no account");
    expect(section).toContain("closed set");
    expect(section).toContain("carry no properties");
    expect(section).toContain("distinct from `trip_type_selected_*`");
    // Payload examples are the bare event only.
    for (const m of section.matchAll(/`\{ ([^}]*) \}`/g)) expect(m[1]).toMatch(/^event: "home_[a-z_]+"$/);
  });

  it("security-baseline.md carries the Revision 3 rules (query param, closed-set analytics, wrapper split, real-URL test)", () => {
    const baseline = norm(read("docs/security-baseline.md"));
    expect(baseline).toContain("A query parameter that selects UI state must be validated server-side against a fixed set");
    expect(baseline).toContain("never copied into the proxy's `next` redirect");
    expect(baseline).toContain("Analytics event names built from a code must go through a helper that returns `undefined`");
    expect(baseline).toContain("do not pass raw `searchParams` or request data to the client");
    expect(baseline).toContain("must have a test that sends the real encoded URL");
  });

  it("compliance-baseline.md carries the Revision 3 rules (public-page events, query parameters)", () => {
    const baseline = norm(read("docs/compliance-baseline.md"));
    expect(baseline).toContain("Events on public or pre-sign-in pages follow the same rules as in-app events");
    expect(baseline).toContain("A URL query parameter is allowed only if it carries a closed-set code");
    expect(baseline).toContain("application-initiated request");
  });

  it("globals.css defines --color-accent-ink and its theme alias", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("--color-accent-ink: oklch(0.42 0.08 80);");
    expect(css).toContain("--color-accent-ink: var(--color-accent-ink);");
  });

  it("Revision 3 did not bump LEGAL_LAST_UPDATED again", () => {
    expect(LEGAL_LAST_UPDATED).toBe("October 13, 2026");
  });

  it("this feature's migration is 0022 and the upstream 0021 is untouched", () => {
    const files = readdirSync(join(root, "supabase/migrations"));
    expect(files).toContain("0022_trip_types_and_other_type.sql");
    expect(files).toContain("0021_revoke_public_trip_summary_grant.sql");
    expect(files.filter((f) => f.startsWith("0021_trip_types"))).toEqual([]);
  });
});
