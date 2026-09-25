import { describe, expect, it, vi } from "vitest";
import { isUnverifiedOwner, requireVerifiedSession } from "./auth-gate";

/**
 * QA coverage for `requireVerifiedSession`'s new optional `prefetchedUser` param
 * (performance-scaling architecture.md's "Add/edit-expense" fix (1)): when supplied, the helper
 * must skip its own `getUser()` round trip entirely and decide purely from the prefetched object;
 * when omitted, behavior must be byte-for-byte the pre-existing self-fetch path (every other call
 * site — `edit/page.tsx`, `invite/page.tsx` — depends on this).
 */

function makeSupabaseStub(user: { is_anonymous?: boolean | null } | null) {
  const getUser = vi.fn(async () => ({ data: { user } }));
  return { auth: { getUser } } as unknown as Parameters<typeof requireVerifiedSession>[0] & {
    auth: { getUser: typeof getUser };
  };
}

describe("requireVerifiedSession", () => {
  it("omitted prefetchedUser: calls getUser() itself and resolves true for a verified (non-anonymous) session", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: false });
    const result = await requireVerifiedSession(supabase);
    expect(result).toBe(true);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("omitted prefetchedUser: resolves false for an anonymous session (self-fetch path)", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: true });
    const result = await requireVerifiedSession(supabase);
    expect(result).toBe(false);
    expect(supabase.auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("omitted prefetchedUser: resolves false when there is no session at all", async () => {
    const supabase = makeSupabaseStub(null);
    const result = await requireVerifiedSession(supabase);
    expect(result).toBe(false);
  });

  it("prefetchedUser supplied (verified): resolves true WITHOUT calling getUser() (the whole point of the fix)", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: false });
    const result = await requireVerifiedSession(supabase, { is_anonymous: false });
    expect(result).toBe(true);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("prefetchedUser supplied (anonymous): resolves false WITHOUT calling getUser()", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: false }); // deliberately mismatched from prefetched value
    const result = await requireVerifiedSession(supabase, { is_anonymous: true });
    expect(result).toBe(false);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("prefetchedUser explicitly null (add-expense's own getUser() came back empty): resolves false WITHOUT calling getUser() again", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: false });
    const result = await requireVerifiedSession(supabase, null);
    expect(result).toBe(false);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });

  it("prefetchedUser with is_anonymous undefined (treated as verified, matching the self-fetch path's `!== true` check)", async () => {
    const supabase = makeSupabaseStub({ is_anonymous: false });
    const result = await requireVerifiedSession(supabase, {});
    expect(result).toBe(true);
    expect(supabase.auth.getUser).not.toHaveBeenCalled();
  });
});

describe("isUnverifiedOwner (unaffected by the prefetchedUser change, regression guard)", () => {
  it("true only for an anonymous session that is also the owner", () => {
    expect(isUnverifiedOwner({ is_anonymous: true }, true)).toBe(true);
  });

  it("false for an anonymous session that is not the owner", () => {
    expect(isUnverifiedOwner({ is_anonymous: true }, false)).toBe(false);
  });

  it("false for a verified session even if owner", () => {
    expect(isUnverifiedOwner({ is_anonymous: false }, true)).toBe(false);
  });

  it("false when there is no session", () => {
    expect(isUnverifiedOwner(null, true)).toBe(false);
  });
});
