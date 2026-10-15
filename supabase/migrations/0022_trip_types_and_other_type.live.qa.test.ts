import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * LIVE verification for migration 0022 (trip types and the Other trip type). NOT part of CI: it is
 * skipped unless all three env vars are set, and it must be run by hand against a NON-production
 * Supabase project (or branch) that already has migration 0022 applied:
 *
 *   LIVE_SUPABASE_URL=... LIVE_SUPABASE_ANON_KEY=... LIVE_SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx vitest run supabase/migrations/0022_trip_types_and_other_type.live.qa.test.ts
 *
 * It uses real PostgREST, real RLS, real anonymous sessions and two verified users created with the
 * admin API (never emailed: addresses are @example.invalid). It creates a few auth users and trips
 * and removes them again in afterAll. It proves what the static .qa.test.ts cannot: the CHECK
 * accept/reject matrix on the real collation, grants, direct-INSERT rejection, and the database
 * side of the "+" gate. The privilege and function-definition checks live in
 * supabase/verify/0022_trip_types_and_other_type.verify.sql (PostgREST cannot read the catalog).
 */

const URL = process.env.LIVE_SUPABASE_URL;
const ANON = process.env.LIVE_SUPABASE_ANON_KEY;
const SERVICE = process.env.LIVE_SUPABASE_SERVICE_ROLE_KEY;
const live = Boolean(URL && ANON && SERVICE);

const PREFIX = "live-0022-";
const RUN = Math.random().toString(36).slice(2, 8);
const PASSWORD = `Pw-${RUN}-${Math.random().toString(36).slice(2)}`;

type Client = SupabaseClient;

function fresh(key: string): Client {
  return createClient(URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

describe.skipIf(!live)("migration 0022 against live Postgres", () => {
  let admin: Client;
  let anon: Client; // anon key, no session
  let organizerAnon: Client; // anonymous session (unverified organizer)
  let outsiderAnon: Client; // anonymous session, member of nothing
  let verified: Client; // verified organizer
  let member: Client; // verified, joins the organizer's trip
  const ids = { organizerAnon: "", outsiderAnon: "", verified: "", member: "" };
  const createdUserIds: string[] = [];

  async function verifiedUser(label: string) {
    const email = `${PREFIX}${RUN}-${label}@example.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    expect(created.error).toBeNull();
    createdUserIds.push(created.data.user!.id);
    const client = fresh(ANON!);
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signedIn.error).toBeNull();
    return { client, id: created.data.user!.id };
  }

  async function anonymousUser() {
    const client = fresh(ANON!);
    const res = await client.auth.signInAnonymously();
    expect(res.error).toBeNull();
    createdUserIds.push(res.data.user!.id);
    return { client, id: res.data.user!.id };
  }

  const insertTrip = (c: Client, createdBy: string, extra: Record<string, unknown> = {}) =>
    c.from("trips").insert({ name: `${PREFIX}${RUN}`, created_by: createdBy, ...extra }).select("id").single();

  beforeAll(async () => {
    admin = fresh(SERVICE!);
    anon = fresh(ANON!);
    const a = await anonymousUser();
    organizerAnon = a.client;
    ids.organizerAnon = a.id;
    const b = await anonymousUser();
    outsiderAnon = b.client;
    ids.outsiderAnon = b.id;
    const v = await verifiedUser("organizer");
    verified = v.client;
    ids.verified = v.id;
    const m = await verifiedUser("member");
    member = m.client;
    ids.member = m.id;
  }, 60_000);

  afterAll(async () => {
    if (!admin) return;
    // Trips cascade to members and list items. Sweep by creator and by name prefix.
    await admin.from("trips").delete().in("created_by", createdUserIds);
    await admin.from("trips").delete().like("name", `${PREFIX}%`);
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
  }, 60_000);

  describe("existing rows, defaults and the old signature", () => {
    it("the old five-named-argument call resolves to the old overload (no PGRST203) and uses the defaults", async () => {
      const { data, error } = await verified.rpc("create_trip", {
        _name: `${PREFIX}${RUN}-old`,
        _display_name: "Old caller",
        _location: null,
        _starts_on: null,
        _ends_on: null,
      });
      expect(error).toBeNull();
      expect(error?.code).not.toBe("PGRST203");
      const row = await admin.from("trips").select("types, other_type").eq("id", data![0].trip_id).single();
      expect(row.data).toEqual({ types: [], other_type: null });
    });

    it("the seven-argument call stores pick order and the normalized text", async () => {
      const { data, error } = await verified.rpc("create_trip", {
        _name: `${PREFIX}${RUN}-new`,
        _display_name: "New caller",
        _location: null,
        _starts_on: null,
        _ends_on: null,
        _types: ["international", "camping"],
        _other_type: "  Ski   weekend ",
      });
      expect(error).toBeNull();
      const row = await admin.from("trips").select("types, other_type").eq("id", data![0].trip_id).single();
      expect(row.data).toEqual({ types: ["international", "camping"], other_type: "Ski weekend" });
    });

    it("a mismatched call returns PGRST202 (the signal the client falls back on)", async () => {
      const { error } = await verified.rpc("create_trip", { _name: "x", _display_name: "y", _types: ["camping"] });
      expect(error?.code).toBe("PGRST202");
    });
  });

  describe("trips_types_check by direct INSERT", () => {
    const reject: Array<[string, unknown]> = [
      ["bogus", ["bogus"]],
      ["duplicate", ["camping", "camping"]],
      ["four elements", ["camping", "airbnb", "international", "camping"]],
      ["null element", [null]],
      ["camping then null", ["camping", null]],
      ["multi-dimensional", [["camping"], ["airbnb"]]],
      ["mixed case", ["Camping"]],
      ["explicit null", null],
      ["other code", ["other"]],
      ["duplicate in a three-element array", ["camping", "airbnb", "camping"]],
    ];
    it.each(reject)("rejects %s", async (_label, types) => {
      const { error } = await insertTrip(verified, ids.verified, { types });
      expect(error).not.toBeNull();
    });

    it.each([
      [[]],
      [["camping"]],
      [["airbnb"]],
      [["international"]],
      [["camping", "airbnb"]],
      [["airbnb", "camping"]],
      [["international", "camping"]],
      [["camping", "airbnb", "international"]],
    ])("accepts %j and keeps the order", async (types) => {
      const { data, error } = await insertTrip(verified, ids.verified, { types });
      expect(error).toBeNull();
      const row = await admin.from("trips").select("types").eq("id", data!.id).single();
      expect(row.data?.types).toEqual(types);
    });
  });

  describe("trips_other_type_check by direct INSERT (real collation)", () => {
    const accept: Array<[string, string]> = [
      ["ASCII", "Ski weekend"],
      ["ASCII Vietnamese", "Chuyen di Da Lat"],
      ["Vietnamese NFC", "Cắm trại"],
      ["Vietnamese NFD", "Cắm trại"],
      ["Japanese", "キャンプ"],
      ["Arabic", "رحلة برية"],
      ["Thai with marks", "ท่องเที่ยว"],
      ["Devanagari with vowel signs", "यात्रा"],
      ["allowed punctuation", "Sam's trip & co, 2.5/3 - x"],
      ["30 characters", "a".repeat(30)],
    ];
    it.each(accept)("accepts %s and round-trips it unchanged", async (_label, value) => {
      const { data, error } = await insertTrip(verified, ids.verified, { other_type: value });
      expect(error).toBeNull();
      const row = await admin.from("trips").select("other_type").eq("id", data!.id).single();
      expect(row.data?.other_type).toBe(value);
    });

    const reject: Array<[string, string]> = [
      ["empty", ""],
      ["spaces only", "   "],
      ["31 characters", "a".repeat(31)],
      ["newline", "ski\nweekend"],
      ["trailing newline", "ski weekend\n"],
      ["tab", "ski\tweekend"],
      ["NUL", "ski\u0000weekend"],
      ["script tag", "<script>"],
      ["formula", "=1+1"],
      ["leading space", " ski"],
      ["trailing space", "ski "],
      ["double space", "ski  weekend"],
      ["right-to-left override U+202E", "ski‮weekend"],
      ["zero-width space U+200B", "ski​weekend"],
      ["grapheme joiner U+034F", "ski͏weekend"],
      ["soft hyphen U+00AD", "ski­weekend"],
      ["no-break space", "ski weekend"],
      ["emoji", "ski 🎿"],
      ["emoji with variation selector", "ski ❤️"],
      ["leading hyphen", "-ski"],
      ["leading combining mark", "́ski"],
      ["each markup character", "ski(1)"],
    ];
    it.each(reject)("rejects %s", async (_label, value) => {
      const { error } = await insertTrip(verified, ids.verified, { other_type: value });
      expect(error).not.toBeNull();
      // The CHECK message must not be what the UI shows; this only documents the code for charset and length.
      if (!_label.startsWith("NUL")) expect(error?.code).toBe("23514");
    });
  });

  describe("the RPC", () => {
    it("rejects a bad Other text with 23514 and creates no trip", async () => {
      const name = `${PREFIX}${RUN}-bad-other`;
      const { error } = await verified.rpc("create_trip", {
        _name: name,
        _display_name: "x",
        _location: null,
        _starts_on: null,
        _ends_on: null,
        _types: ["camping"],
        _other_type: "<b>hi</b>",
      });
      expect(error?.code).toBe("23514");
      const rows = await admin.from("trips").select("id").eq("name", name);
      expect(rows.data).toEqual([]);
    });
  });

  describe("privileges", () => {
    it("anon cannot call either create_trip signature", async () => {
      const five = await anon.rpc("create_trip", { _name: "x", _display_name: "y", _location: null, _starts_on: null, _ends_on: null });
      const seven = await anon.rpc("create_trip", {
        _name: "x",
        _display_name: "y",
        _location: null,
        _starts_on: null,
        _ends_on: null,
        _types: [],
        _other_type: null,
      });
      expect(five.error).not.toBeNull();
      expect(seven.error).not.toBeNull();
    });
  });

  describe("no UPDATE path", () => {
    it("neither the organizer nor a member can change types or other_type", async () => {
      const created = await verified.rpc("create_trip", {
        _name: `${PREFIX}${RUN}-update`,
        _display_name: "Org",
        _location: null,
        _starts_on: null,
        _ends_on: null,
        _types: ["camping"],
        _other_type: null,
      });
      const tripId = created.data![0].trip_id as string;
      const joined = await member.rpc("join_trip_by_id", { _trip_id: tripId, _display_name: "Member" });
      expect(joined.error).toBeNull();
      for (const [who, client] of [
        ["organizer", verified],
        ["member", member],
      ] as const) {
        for (const patch of [{ types: ["airbnb"] }, { other_type: "Changed" }]) {
          const res = await client.from("trips").update(patch).eq("id", tripId).select();
          expect(res.error !== null || (res.data ?? []).length === 0, `${who} ${JSON.stringify(patch)}`).toBe(true);
        }
      }
      const row = await admin.from("trips").select("types, other_type").eq("id", tripId).single();
      expect(row.data).toEqual({ types: ["camping"], other_type: null });
    });
  });

  describe('the database side of the "+" gate', () => {
    const tripWith = async (client: Client) => {
      const created = await client.rpc("create_trip", { _name: `${PREFIX}${RUN}-gate`, _display_name: "Org", _location: null, _starts_on: null, _ends_on: null });
      const tripId = created.data![0].trip_id as string;
      const members = await admin.from("trip_members").select("id, user_id").eq("trip_id", tripId);
      return { tripId, memberId: members.data![0].id as string };
    };
    const addItem = (client: Client, tripId: string, addedBy: string) =>
      client.from("shopping_list_items").insert({ trip_id: tripId, added_by: addedBy, description: "Tent" });

    it("rejects an unverified (anonymous) organizer", async () => {
      const t = await tripWith(organizerAnon);
      expect((await addItem(organizerAnon, t.tripId, t.memberId)).error).not.toBeNull();
    });

    it("rejects a non-member using the organizer's member id", async () => {
      const t = await tripWith(verified);
      expect((await addItem(outsiderAnon, t.tripId, t.memberId)).error).not.toBeNull();
    });

    it("accepts a verified organizer, and rejects the same insert once the trip is completed", async () => {
      const t = await tripWith(verified);
      expect((await addItem(verified, t.tripId, t.memberId)).error).toBeNull();
      expect((await verified.rpc("complete_trip", { _trip_id: t.tripId })).error).toBeNull();
      expect((await addItem(verified, t.tripId, t.memberId)).error).not.toBeNull();
    });
  });

  describe("public RPCs do not return the new columns", () => {
    it("get_trip_by_invite_code and get_trip_summary rows have no types or other_type keys", async () => {
      const created = await verified.rpc("create_trip", {
        _name: `${PREFIX}${RUN}-rpc`,
        _display_name: "Org",
        _location: null,
        _starts_on: null,
        _ends_on: null,
        _types: ["camping"],
        _other_type: "Ski weekend",
      });
      const { trip_id: tripId, invite_code: code } = created.data![0];
      const invite = await member.rpc("get_trip_by_invite_code", { _code: code });
      const summary = await member.rpc("get_trip_summary", { _trip_id: tripId });
      for (const res of [invite, summary]) {
        expect(res.error).toBeNull();
        const keys = Object.keys((res.data as Array<Record<string, unknown>>)[0] ?? {});
        expect(keys).not.toContain("types");
        expect(keys).not.toContain("other_type");
      }
    });
  });
});
