import { describe, expect, it } from "vitest";
import { buildInviteMailto, buildInviteMessage, isPlausibleEmail, stripControlChars } from "./mailto-invite";

const base = { to: "dad@example.com", organizerName: "Sam", tripName: "Lisbon", joinUrl: "https://splitiful.app/join/abc12345" };

function parse(url: string) {
  const [head, query] = url.split("?");
  const params = new URLSearchParams(query);
  return { to: decodeURIComponent(head.slice("mailto:".length)), subject: params.get("subject")!, body: params.get("body")!, keys: [...params.keys()] };
}

describe("email-invites mailto adversarial (QA)", () => {
  it("exact subject and body", () => {
    const m = parse(buildInviteMailto(base));
    expect(m.subject).toBe("Sam invited you to Lisbon on Splitiful");
    expect(m.body).toBe("Hi there,\r\n\r\nI'm using Splitiful to split costs for Lisbon. Join here:\r\nhttps://splitiful.app/join/abc12345\r\n\r\nSam");
    expect(m.keys).toEqual(["subject", "body"]);
  });
  it("always greets 'there' (no name field)", () => {
    expect(buildInviteMessage(base).body.startsWith("Hi there,")).toBe(true);
  });
  it.each(["x<y@z.com>", "a@b.com,c@d.com", "a@b.com;c@d.com", "a@b.com%0d%0aBcc:v@x.com", "a@b.com\r\nBcc: v@x.com", "a b@c.com", '"a"@b.com', "a@b", "a@b.com?cc=v@x.com", "a@b.com&bcc=v@x.com", "ünï@example.com", "a@exämple.com", `${"a".repeat(65)}@b.com`, `a@${"b".repeat(260)}.com`, "a@b.com>", "<a@b.com>"])(
    "rejects %s", (e) => {
      expect(isPlausibleEmail(e)).toBe(false);
      expect(() => buildInviteMailto({ ...base, to: e })).toThrow();
    });
  it("accepts normal and plus addresses", () => {
    for (const e of ["a@b.com", "first.last+tag@sub.example.co.uk", " a@b.com "]) expect(isPlausibleEmail(e)).toBe(true);
  });
  it("hostile names cannot add headers/recipients", () => {
    const evil = "Dad\r\nBcc: v@x.com\u2028Cc: w@x.com\u0085&to=z@x.com";
    const url = buildInviteMailto({ ...base, organizerName: evil, tripName: evil });
    expect(url.split("?").length).toBe(2);
    expect(url).not.toMatch(/[\r\n ]/);
    const m = parse(url);
    expect(m.keys).toEqual(["subject", "body"]);
    expect(m.to).toBe("dad@example.com");
    expect(m.subject).not.toMatch(/[\r\n\u2028\u0085]/);
    // only the template's own CRLFs remain in the body
    expect(/[\n\u2028\u0085]/.test(m.body.replace(/\r\n/g, ""))).toBe(false);
    expect(m.body.split("\r\n").length).toBe(6);
  });
  it("literal %0d%0a in a name is encoded, not decoded into a break", () => {
    const m = parse(buildInviteMailto({ ...base, tripName: "a%0d%0aBcc:v@x.com" }));
    expect(m.body.split("\r\n").length).toBe(6);
    expect(m.body).toContain("a%0d%0aBcc:v@x.com");
  });
  it("unicode and very long input round-trip, url stays well-formed", () => {
    const m = parse(buildInviteMailto({ ...base, organizerName: "Zoë 日本語 👨‍👩‍👧", tripName: "Café ✈ ".repeat(200) }));
    expect(m.subject.startsWith("Zoë 日本語 👨‍👩‍👧 invited you to")).toBe(true);
    const long = buildInviteMailto({ ...base, tripName: "x".repeat(5000) });
    expect(long.length).toBeLessThanOrEqual(1800); // names are shortened to keep the URL under the cap (A2)
    expect(parse(long).body).toContain(base.joinUrl);
  });
  it("stripControlChars", () => {
    expect(stripControlChars("a\u0000b\u007fc\u009fd\te\n f")).toBe("a b c d e f");
  });
});
