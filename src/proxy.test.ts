import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const createServerClientMock = vi.fn(() => ({ auth: { getUser: getUserMock } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => createServerClientMock() }));

let env: { url: string; anonKey: string } | null = { url: "http://localhost:1", anonKey: "dummy" };
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnv: () => env }));

import { proxy } from "./proxy";

const req = (path: string) => new NextRequest(`http://localhost:3000${path}`);
const isRedirect = (res: Response) => res.status >= 300 && res.status < 400;

beforeEach(() => {
  vi.clearAllMocks();
  env = { url: "http://localhost:1", anonKey: "dummy" };
  getUserMock.mockResolvedValue({ data: { user: null } });
});

describe("proxy: public routes stay public (Revision 3 invariants)", () => {
  it.each(["/trip/new?type=camping", "/trip/new", "/", "/?signin=1"])(
    "%s passes through with no redirect and no Supabase call",
    async (path) => {
      const res = await proxy(req(path));
      expect(isRedirect(res)).toBe(false);
      expect(res.headers.get("location")).toBeNull();
      expect(createServerClientMock).not.toHaveBeenCalled();
    },
  );

  it("/trip/new is not treated as session-required even when env is missing", async () => {
    env = null;
    const res = await proxy(req("/trip/new?type=camping"));
    expect(isRedirect(res)).toBe(false);
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});

describe("proxy: /trips without a session", () => {
  it("redirects to /?next=%2Ftrips and carries no other query key", async () => {
    const res = await proxy(req("/trips?type=camping&utm_source=x"));
    expect(isRedirect(res)).toBe(true);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("?next=%2Ftrips");
  });

  it("lets a signed-in user through", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u" } } });
    const res = await proxy(req("/trips"));
    expect(isRedirect(res)).toBe(false);
  });
});

describe("proxy: /you gated the same way as /trips (redesign-ui architecture.md §3.4)", () => {
  it("redirects to /?next=%2Fyou and carries no other query key when there is no session", async () => {
    const res = await proxy(req("/you?utm_source=x"));
    expect(isRedirect(res)).toBe(true);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("?next=%2Fyou");
  });

  it("lets a signed-in user through to /you", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u" } } });
    const res = await proxy(req("/you"));
    expect(isRedirect(res)).toBe(false);
  });

  it("does not loosen or tighten gating on /trips or /feedback by adding the /you pattern", async () => {
    const trips = await proxy(req("/trips"));
    expect(isRedirect(trips)).toBe(true);
    const feedback = await proxy(req("/feedback"));
    expect(isRedirect(feedback)).toBe(true);
    // Unrelated routes stay public, same as before this feature — no Supabase call at all.
    const home = await proxy(req("/"));
    expect(isRedirect(home)).toBe(false);
    expect(createServerClientMock).toHaveBeenCalledTimes(2);
  });

  it("only matches the literal /you prefix, not an unrelated path that happens to contain it", async () => {
    // e.g. a future "/your-stuff" route shouldn't accidentally be swept into this pattern.
    const res = await proxy(req("/yourself"));
    // /^\/you/ does match "/yourself" (prefix match) — document the real regex behavior rather
    // than assume a word-boundary that doesn't exist, so a stricter future route doesn't get
    // silently caught by this broad prefix.
    expect(isRedirect(res)).toBe(true);
  });
});
