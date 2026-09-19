import { describe, expect, it, vi, beforeEach } from "vitest";

const getTripByInviteCodeMock = vi.fn();
const enforceRateLimitMock = vi.fn();

vi.mock("@/lib/data/trips", () => ({
  getTripByInviteCode: (...args: unknown[]) => getTripByInviteCodeMock(...args),
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return {
    ...actual,
    enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({}),
}));

async function importRoute() {
  return import("./route");
}

function paramsFor(code: string) {
  return { params: Promise.resolve({ code }) };
}

describe("GET /api/trip-invite/[code]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockResolvedValue(null);
  });

  it("returns the invite info for a valid code", async () => {
    const invite = {
      tripId: "trip-123",
      name: "Ski Trip",
      location: "Aspen",
      startsOn: "2026-01-01",
      endsOn: "2026-01-05",
      isCompleted: false,
      organizerName: "Pat",
    };
    getTripByInviteCodeMock.mockResolvedValue(invite);
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(invite);
    expect(getTripByInviteCodeMock).toHaveBeenCalledWith(expect.anything(), "ABC12345");
  });

  it("404s when the invite code doesn't match any trip", async () => {
    getTripByInviteCodeMock.mockResolvedValue(null);
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/doesnotexist"), paramsFor("doesnotexist"));
    expect(res.status).toBe(404);
  });

  it("400s when the code param is empty", async () => {
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/"), paramsFor(""));
    expect(res.status).toBe(400);
    expect(getTripByInviteCodeMock).not.toHaveBeenCalled();
  });

  it("500s when the lookup throws (e.g. malformed code rejected by the RPC)", async () => {
    getTripByInviteCodeMock.mockRejectedValue(new Error("invalid input syntax"));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/bad'code"), paramsFor("bad'code"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Couldn't load this trip.");
  });

  it("429s with Retry-After when the RPC's own Postgres-side throttle rejects the call (migration 0013) — the direct-to-Supabase path this app's own rate limiter can't cover", async () => {
    getTripByInviteCodeMock.mockRejectedValue(new Error("rate limited: try again shortly"));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.json();
    expect(body.error).toBe("Too many requests.");
  });

  it("short-circuits with the rate limiter's response before looking up the code", async () => {
    const limited = new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: { "Retry-After": "42" },
    });
    // enforceRateLimit returns a NextResponse in production code, but any Response-shaped
    // object works for this test since the route just returns whatever it gets back.
    enforceRateLimitMock.mockResolvedValue(limited);
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(getTripByInviteCodeMock).not.toHaveBeenCalled();
  });

  it("passes the rate limiter the correct key/limit/window", async () => {
    getTripByInviteCodeMock.mockResolvedValue(null);
    const { GET } = await importRoute();
    await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    expect(enforceRateLimitMock).toHaveBeenCalledWith(expect.anything(), {
      key: "trip-invite-lookup",
      limit: 10,
      windowSeconds: 60,
    });
  });
});
