import { describe, expect, it, vi, beforeEach } from "vitest";

const joinTripMock = vi.fn();
const sendTripEmailMock = vi.fn();
const getUserMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/lib/data/trips", () => ({
  joinTrip: (...args: unknown[]) => joinTripMock(...args),
}));

vi.mock("@/lib/email", () => ({
  sendTripEmail: (...args: unknown[]) => sendTripEmailMock(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: () => getUserMock() },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => singleMock(),
        }),
      }),
    }),
  }),
}));

async function importRoute() {
  return import("./route");
}

describe("POST /api/join", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { email: "pat@example.com" } } });
    singleMock.mockResolvedValue({ data: { name: "Ski Trip" } });
  });

  it("400s when inviteCode is missing", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ displayName: "Pat" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(joinTripMock).not.toHaveBeenCalled();
  });

  it("400s when inviteCode is not a string", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: 123 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns the tripId on success and passes displayName through to joinTrip", async () => {
    joinTripMock.mockResolvedValue("trip-123");
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123", displayName: "Pat" }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ tripId: "trip-123" });
    expect(joinTripMock).toHaveBeenCalledWith(expect.anything(), {
      inviteCode: "ABC123",
      displayName: "Pat",
    });
  });

  it("defaults displayName to empty string when omitted", async () => {
    joinTripMock.mockResolvedValue("trip-123");
    const { POST } = await importRoute();
    await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123" }),
      }),
    );
    expect(joinTripMock).toHaveBeenCalledWith(expect.anything(), {
      inviteCode: "ABC123",
      displayName: "",
    });
  });

  it("returns 500 with the thrown message when joinTrip fails (e.g. unauthenticated caller, RLS/RPC grant denial, or bad invite code)", async () => {
    joinTripMock.mockRejectedValue(new Error("permission denied for function join_trip"));
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123", displayName: "Pat" }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("permission denied for function join_trip");
    // No confirmation email should be attempted since the join itself never succeeded.
    expect(sendTripEmailMock).not.toHaveBeenCalled();
  });

  it("returns a generic message when joinTrip throws a non-Error value", async () => {
    joinTripMock.mockRejectedValue("weird string throw");
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123" }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Couldn't join the trip.");
  });

  it("still returns tripId (join success) even if the best-effort confirmation email fails", async () => {
    joinTripMock.mockResolvedValue("trip-123");
    sendTripEmailMock.mockRejectedValue(new Error("Resend is down"));
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123", displayName: "Pat" }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ tripId: "trip-123" });
  });

  it("skips sending the confirmation email if the post-join session has no user/email", async () => {
    joinTripMock.mockResolvedValue("trip-123");
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await importRoute();
    const res = await POST(
      new Request("http://localhost/api/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: "ABC123", displayName: "Pat" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sendTripEmailMock).not.toHaveBeenCalled();
  });
});
