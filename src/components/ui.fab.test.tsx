import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BottomBar, Button, FabBar, LinkButton } from "./ui";

describe("fab variant and FabBar (additive)", () => {
  it("the fab pill is flat ink at 90% with the canvas shadow: no blur, no entrance animation", () => {
    const html = renderToStaticMarkup(
      <LinkButton href="/trip/new" variant="fab">
        New trip
      </LinkButton>,
    );
    expect(html).toContain("text-white");
    expect(html).toContain("[background:color-mix(in_srgb,var(--color-ink)_90%,transparent)]");
    expect(html).toContain("[box-shadow:0_10px_30px_rgba(35,28,18,.28)]");
    expect(html).not.toContain("backdrop-blur");
    expect(html).not.toContain("animate-capsule-in");
    expect(html).toContain("h-14");
    expect(html).toContain("rounded-full");
  });

  it("FabBar floats fixed to the viewport bottom, 14px from the sides and 18px (or the safe-area inset) up, with no background", () => {
    const html = renderToStaticMarkup(<FabBar>x</FabBar>);
    expect(html).toContain("fixed bottom-0 left-1/2 z-10 w-full max-w-md -translate-x-1/2 px-3.5 pb-[max(18px,env(safe-area-inset-bottom))]");
    expect(html).toContain("pointer-events-none");
    expect(html).not.toContain("sticky");
    expect(html).not.toContain("gradient");
    expect(html).not.toContain("bg-");
  });

  it("leaves BottomBar and the capsule variants exactly as they were", () => {
    expect(renderToStaticMarkup(<BottomBar>x</BottomBar>)).toContain(
      'class="sticky bottom-0 flex-none bg-gradient-to-t from-paper from-60% to-transparent px-4 pt-3 pb-[max(24px,env(safe-area-inset-bottom))]"',
    );
    const capsule = renderToStaticMarkup(<Button variant="capsule">x</Button>);
    expect(capsule).toContain(
      "text-white backdrop-blur-xl [background:var(--surface-capsule)] [box-shadow:var(--shadow-capsule)] animate-capsule-in",
    );
    const muted = renderToStaticMarkup(<Button variant="capsuleMuted">x</Button>);
    expect(muted).toContain(
      "text-ink/70 backdrop-blur-xl [background:var(--surface-capsule-muted)] [box-shadow:var(--shadow-capsule-sm)] cursor-default animate-capsule-in",
    );
  });
});
