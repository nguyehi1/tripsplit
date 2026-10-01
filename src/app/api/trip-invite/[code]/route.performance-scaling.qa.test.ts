import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Additional QA coverage for performance-scaling's "Invite/join preview" fix beyond the
 * engineer's own route.test.ts: the failure mode where `getTripSummary` itself throws (rather than
 * resolving null) after a successful invite lookup — must degrade to the route's existing generic
 * 500, not crash or leak a partial/invite-only response with the wrong status.
 */

const getTripByInviteCodeMock = vi.fn();
const getTripSummaryMock = vi.fn();
const enforceRateLimitMock = vi.fn();

vi.mock("@/lib/data/trips", () => ({
  getTripByInviteCode: (...args: unknown[]) => getTripByInviteCodeMock(...args),
  getTripSummary: (...args: unknown[]) => getTripSummaryMock(...args),
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

// Migration 0017: getTripByInviteCode now goes through a service-role client (the public grant
// was revoked after a live-confirmed x-forwarded-for spoofing bypass of its throttle) — mocked
// here too so this file's own tests don't hit the real "not configured" throw.
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({}),
}));

async function importRoute() {
  return import("./route");
}

function paramsFor(code: string) {
  return { params: Promise.resolve({ code }) };
}

const invite = {
  tripId: "trip-123",
  name: "Ski Trip",
  location: "Aspen",
  startsOn: "2026-01-01",
  endsOn: "2026-01-05",
  isCompleted: false,
  organizerName: "Pat",
};

describe("GET /api/trip-invite/[code] — getTripSummary failure mode (performance-scaling)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enforceRateLimitMock.mockResolvedValue(null);
  });

  it("500s (not a partial 200, not a crash) when getTripByInviteCode succeeds but getTripSummary throws", async () => {
    getTripByInviteCodeMock.mockResolvedValue(invite);
    getTripSummaryMock.mockRejectedValue(new Error("unexpected RPC failure"));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Couldn't load this trip.");
  });

  it("does not throttle get_trip_summary's own Postgres-side rejection any differently than the invite lookup's (isDbRateLimitError treats both the same, matching architecture.md's 'get_trip_summary itself is not touched' claim)", async () => {
    getTripByInviteCodeMock.mockResolvedValue(invite);
    getTripSummaryMock.mockRejectedValue(new Error("rate limited: try again shortly"));
    const { GET } = await importRoute();
    const res = await GET(new Request("http://localhost/api/trip-invite/ABC12345"), paramsFor("ABC12345"));
    // This is deliberately exercising that the route's existing isDbRateLimitError catch-all
    // would also catch a (currently nonexistent) Postgres-side throttle rejection from
    // get_trip_summary consistently with getTripByInviteCode's — not asserting get_trip_summary
    // actually has such a throttle (it doesn't, per migration 0013/architecture.md).
    expect(res.status).toBe(429);
  });
});
