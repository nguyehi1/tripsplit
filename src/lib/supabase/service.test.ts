import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * QA coverage for the service-role client introduced by migration 0017 (docs/product/roadmap.md's
 * invite-code-rpc-hardening entry — a live-confirmed x-forwarded-for spoofing bypass of
 * get_trip_by_invite_code's throttle). Focus: this must fail loudly, not silently fall back to
 * an unprivileged client, when the service-role key isn't configured — a silent fallback here
 * would quietly reopen the exact bypass this migration closes.
 */

const createClientMock = vi.fn((..._args: unknown[]) => ({ from: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-secret";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("createServiceClient", () => {
  it("creates a Supabase client with the service-role key, auto-refresh/session-persist disabled", async () => {
    const { createServiceClient } = await import("./service");
    createServiceClient();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-secret",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  });

  it("throws rather than silently proceeding when SUPABASE_SERVICE_ROLE_KEY is unset", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const { createServiceClient } = await import("./service");
    expect(() => createServiceClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("throws when the Supabase URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { createServiceClient } = await import("./service");
    expect(() => createServiceClient()).toThrow();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
