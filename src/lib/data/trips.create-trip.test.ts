import { describe, expect, it, vi } from "vitest";
import { createTrip, CreateTripError } from "./trips";

const row = { trip_id: "t1", invite_code: "abc" };

function client(responses: Array<{ data?: unknown; error?: unknown }>) {
  const rpc = vi.fn();
  for (const r of responses) rpc.mockResolvedValueOnce({ data: null, error: null, ...r });
  return { supabase: { rpc } as never, rpc };
}

const base = { name: "Tahoe", displayName: "" };

describe("createTrip", () => {
  it("uses the five-argument call when nothing is picked", async () => {
    const { supabase, rpc } = client([{ data: [row] }]);
    const out = await createTrip(supabase, base);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(
      ["_display_name", "_ends_on", "_location", "_name", "_starts_on"].sort(),
    );
    expect(out).toEqual({ tripId: "t1", inviteCode: "abc", typesStored: false });
  });

  it("uses the seven-argument call, in pick order, when types or Other are given", async () => {
    const { supabase, rpc } = client([{ data: [row] }]);
    const out = await createTrip(supabase, { ...base, types: ["international", "camping"], otherType: "Ski weekend" });
    expect(rpc.mock.calls[0][1]).toMatchObject({ _types: ["international", "camping"], _other_type: "Ski weekend" });
    expect(Object.keys(rpc.mock.calls[0][1])).toHaveLength(7);
    expect(out.typesStored).toBe(true);
  });

  it.each(["PGRST202", "42883"])("falls back to the five-argument call on %s", async (code) => {
    const { supabase, rpc } = client([{ error: { code } }, { data: [row] }]);
    const out = await createTrip(supabase, { ...base, types: ["camping"], otherType: "Ski" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(Object.keys(rpc.mock.calls[1][1])).toHaveLength(5);
    expect(out.typesStored).toBe(false);
  });

  it.each(["23514", "42501", "PGRST301", undefined])("does not fall back on %s", async (code) => {
    const { supabase, rpc } = client([{ error: { code, message: "violates check", details: "Failing row contains (Ski)" } }]);
    await expect(createTrip(supabase, { ...base, otherType: "Ski" })).rejects.toBeInstanceOf(CreateTripError);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("a single-type create that hits a CHECK violation (old CHECK, 23514) is never retried or widened to the five-argument call", async () => {
    const { supabase, rpc } = client([{ error: { code: "23514", message: "violates trips_types_check" } }]);
    await expect(createTrip(supabase, { ...base, types: ["airbnb"] })).rejects.toBeInstanceOf(CreateTripError);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(Object.keys(rpc.mock.calls[0][1])).toHaveLength(7);
  });

  it("throws an error that carries only a code, never the original message or details", async () => {
    const { supabase } = client([
      { error: { code: "23514", message: "violates trips_other_type_check", details: "Failing row contains (Ski)", hint: "h" } },
    ]);
    const err = await createTrip(supabase, { ...base, otherType: "Ski" }).catch((e) => e);
    expect(err.code).toBe("23514");
    expect(JSON.stringify(err) + err.message + String(err.stack?.split("\n")[0])).not.toMatch(/Ski|violates|trips_other_type_check/);
  });
});
