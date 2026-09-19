// QA regression test for the ux-revamp fix: design.md section 2 ("States") explicitly says the
// shared sign-in form (`/?signin=1`) should not pick up "Welcome-specific elements... the new
// paw-print texture", while both Welcome and sign-in keep `glow`. This locks in `page.tsx`'s
// `<Screen glow texture={!showSignIn}>` branch selection so a future regression (e.g. reverting
// to an unconditional `texture`) is caught by `npm test`, not just by manual/QA inspection.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const eqMock = vi.fn();
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: () => ({ select: () => ({ eq: eqMock }) }),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

// Stub out HomeScreen (its own auth-branching behavior is covered by
// home-screen.auth-branching.qa.test.tsx) so this test is isolated to page.tsx's Screen prop
// selection, not HomeScreen's client-only internals (useRouter/useState/useLayoutEffect).
vi.mock("./home-screen", () => ({
  HomeScreen: ({ showSignIn }: { showSignIn: boolean }) => (
    <div data-testid="home-screen" data-signin={String(showSignIn)} />
  ),
}));

describe("HomePage (`/`) — Screen glow/texture prop selection (design.md section 2)", () => {
  it("Welcome (no signin param) renders with both glow and the paw-print texture", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const { default: HomePage } = await import("./page");
    const el = await HomePage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(el);

    expect(html).toContain("var(--glow-blob-1)");
    expect(html).toContain("var(--texture-paw)");
    expect(html).toContain('data-signin="false"');
  });

  it("sign-in (`/?signin=1`) renders with glow but WITHOUT the paw-print texture", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const { default: HomePage } = await import("./page");
    const el = await HomePage({ searchParams: Promise.resolve({ signin: "1" }) });
    const html = renderToStaticMarkup(el);

    expect(html).toContain("var(--glow-blob-1)");
    expect(html).not.toContain("var(--texture-paw)");
    expect(html).toContain('data-signin="true"');
  });

  it("sign-in still forces the welcome content even with an active session (?signin=1 override)", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1", is_anonymous: false } } });
    const { default: HomePage } = await import("./page");
    const el = await HomePage({ searchParams: Promise.resolve({ signin: "1" }) });
    const html = renderToStaticMarkup(el);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(html).not.toContain("var(--texture-paw)");
    expect(html).toContain('data-signin="true"');
  });
});
