import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandRow } from "./brand-row";

/**
 * QA coverage for board S's brand row (requirements.md AC4/AC5; brand-lockup-s.md §2) — no test
 * covered this component before this design-audit fix round. Both fixed size variants, and the
 * sticker-card tile's construction (10px radius, `card` fill, `shadow-card-sm`, no border, no
 * tilt), per the spec table.
 *
 * Note (QA finding, latest round of live user feedback, 2026-10-16): `BrandRow`'s `"welcome"`
 * size preset has no remaining caller anywhere in the app — Welcome (`/`) reverted to a bespoke
 * composition (sticker-card plate + DogFace + speech bubble + separate Wordmark, see
 * `redesign-ui.brand-row-call-sites.qa.test.tsx`) instead of `<BrandRow size="welcome">`. The
 * `"welcome"` tests below still exercise real, still-supported component behavior (not dead
 * code in the sense of unreachable — the component itself is unchanged and still exports both
 * sizes), just not behavior any call site currently uses. Left in rather than deleted, since the
 * component's public two-size API is still intentional per `brand-lockup-s.md`'s sizing table —
 * flagged here for engineering's awareness rather than removed unilaterally.
 */
describe("BrandRow", () => {
  it('size="welcome": 44x44px sticker tile and 150x42px wordmark', () => {
    const html = renderToStaticMarkup(<BrandRow size="welcome" />);
    expect(html).toContain("width:44px;height:44px");
    expect(html).toContain("width:150px;height:42px");
  });

  it('size="compact": 34x34px sticker tile and 112x31px wordmark', () => {
    const html = renderToStaticMarkup(<BrandRow size="compact" />);
    expect(html).toContain("width:34px;height:34px");
    expect(html).toContain("width:112px;height:31px");
  });

  it("lays out icon-then-wordmark (icon tile first, wordmark second), flex items-center gap-3, 12px gap", () => {
    const html = renderToStaticMarkup(<BrandRow size="welcome" />);
    expect(html).toMatch(/class="flex items-center gap-3[^"]*"[^<]*<span[\s\S]*<\/span>[\s\S]*<img[^>]*alt="Splitiful"/);
    const tileIdx = html.indexOf('rounded-[10px]');
    const wordmarkIdx = html.indexOf('alt="Splitiful"');
    expect(tileIdx).toBeGreaterThanOrEqual(0);
    expect(wordmarkIdx).toBeGreaterThan(tileIdx);
  });

  it("the sticker tile is a 10px-radius card with shadow-card-sm, no border, no tilt, and the icon inside has no wordmark of its own", () => {
    const html = renderToStaticMarkup(<BrandRow size="compact" />);
    expect(html).toContain("rounded-[10px]");
    expect(html).toContain("shadow-card-sm");
    expect(html).toContain("bg-card");
    expect(html).not.toContain("border");
    expect(html).not.toContain("rotate(");
    expect(html).not.toContain("transform");
    // Exactly one wordmark per brand row (the icon itself carries no text).
    expect(html.match(/alt="Splitiful"/g)).toHaveLength(1);
  });

  it("passes through an outer className to the row wrapper", () => {
    const html = renderToStaticMarkup(<BrandRow size="welcome" className="my-test-class" />);
    expect(html).toContain("flex items-center gap-3 my-test-class");
  });
});
