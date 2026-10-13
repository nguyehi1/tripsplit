import { describe, expect, it } from "vitest";
import { buildInviteMailto, buildInviteMessage, isPlausibleEmail, MAX_MAILTO_LENGTH, stripControlChars } from "./mailto-invite";

const base = {
  to: "dad@gmail.com",
  organizerName: "Olivia",
  tripName: "Lake Tahoe",
  joinUrl: "https://splitiful.app/join/ab12cd34",
};

function parse(mailto: string) {
  const [head, query] = mailto.split("?");
  const params = new URLSearchParams(query);
  return { to: decodeURIComponent(head.replace(/^mailto:/, "")), subject: params.get("subject")!, body: params.get("body")! };
}

describe("buildInviteMessage — the final copy", () => {
  it("uses the exact subject and body", () => {
    const { subject, body } = buildInviteMessage(base);
    expect(subject).toBe("Olivia invited you to Lake Tahoe on Splitiful");
    expect(body).toBe(
      "Hi there,\r\n\r\nI'm using Splitiful to split costs for Lake Tahoe. Join here:\r\nhttps://splitiful.app/join/ab12cd34\r\n\r\nOlivia",
    );
  });

  it("always greets 'there' (there is no name field)", () => {
    expect(buildInviteMessage(base).body.startsWith("Hi there,")).toBe(true);
  });

  it("has no footer, 'Do not reply' or code explanation", () => {
    const { body } = buildInviteMessage(base);
    expect(body).not.toMatch(/do not reply|unsubscribe|code/i);
  });
});

describe("buildInviteMailto — encoding and injection", () => {
  it("round-trips through the mailto: URL", () => {
    const m = parse(buildInviteMailto(base));
    expect(m.to).toBe("dad@gmail.com");
    expect(m.subject).toBe("Olivia invited you to Lake Tahoe on Splitiful");
    expect(m.body).toContain("Hi there,\r\n");
    expect(m.body).toContain("https://splitiful.app/join/ab12cd34");
  });

  it("percent-encodes everything and uses %0D%0A line breaks", () => {
    const url = buildInviteMailto(base);
    expect(url.startsWith("mailto:dad@gmail.com?subject=")).toBe(true);
    expect(url).toContain("%0D%0A");
    expect(url).not.toMatch(/[\r\n ]/);
    expect(url.split("?")).toHaveLength(2);
  });

  it("cannot add headers or recipients through names containing CR/LF, control characters or header text", () => {
    const evil = buildInviteMailto({
      ...base,
      tripName: "Trip\r\nBcc: victim@evil.com",
      organizerName: "Olivia\nCc: victim@evil.com",
    });
    const m = parse(evil);
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toBe("Olivia Cc: victim@evil.com invited you to Trip Bcc: victim@evil.com on Splitiful");
    // Only the body's own line breaks remain; none come from a name.
    expect(m.body.split("\r\n")).toHaveLength(6);
    expect(m.body.startsWith("Hi there,")).toBe(true);
    expect(m.body).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    // The query holds exactly subject and body: no injected "&bcc=" parameter.
    expect([...new URLSearchParams(evil.split("?")[1]).keys()]).toEqual(["subject", "body"]);
  });

  it("encodes & = ? # and non-ASCII in names so they can't smuggle parameters", () => {
    const m = parse(buildInviteMailto({ ...base, tripName: "A&bcc=x@y.com?#é" }));
    expect(m.subject).toContain("A&bcc=x@y.com?#é");
    const url = buildInviteMailto({ ...base, organizerName: "A&bcc=x@y.com" });
    expect([...new URLSearchParams(url.split("?")[1]).keys()]).toEqual(["subject", "body"]);
  });

  it("refuses an address that isn't plausible, including display-name wrappers and extra recipients", () => {
    for (const to of ["x<victim@gmail.com>", "a@b.com,c@d.com", "a@b.com;c@d.com", "a b@c.de", "not-an-email", ""]) {
      expect(() => buildInviteMailto({ ...base, to })).toThrow();
    }
  });
});

describe("buildInviteMailto — length cap", () => {
  it("leaves a normal URL untouched", () => {
    expect(buildInviteMailto(base).length).toBeLessThan(MAX_MAILTO_LENGTH);
    expect(parse(buildInviteMailto(base)).body).toContain("Hi there,");
  });

  it("shortens the names, never the address or the join link, when heavy encoding would pass the cap", () => {
    const heavy = "é".repeat(50); // ~6 encoded characters each, three times over
    const long = { ...base, to: `${"a".repeat(64)}@${"b".repeat(60)}.com`, organizerName: heavy, tripName: "é".repeat(300) };
    const url = buildInviteMailto(long);
    expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
    expect(url.startsWith(`mailto:${long.to}?`)).toBe(true);
    expect(parse(url).body).toContain(base.joinUrl);
  });
});

describe("buildInviteMailto — surrogate pairs when shortening", () => {
  it("never throws on emoji-heavy long names: truncates by code point, not UTF-16 unit", () => {
    const emoji = "👨‍👩‍👧😀".repeat(40);
    for (const len of [30, 41, 55, 99, 300]) {
      const name = emoji.slice(0, len); // may even start with a pre-cut lone surrogate end
      const input = { ...base, organizerName: name, tripName: "😀".repeat(400) };
      let url = "";
      expect(() => (url = buildInviteMailto(input))).not.toThrow();
      expect(url.length).toBeLessThanOrEqual(MAX_MAILTO_LENGTH);
      expect(() => decodeURIComponent(url.split("?")[1])).not.toThrow();
    }
  });

  it("a name that is already cut mid-pair is made well-formed instead of throwing", () => {
    const broken = "ab\ud83d"; // lone high surrogate
    expect(() => buildInviteMailto({ ...base, tripName: broken })).not.toThrow();
  });
});

describe("isPlausibleEmail / stripControlChars", () => {
  it.each([
    ["dad@gmail.com", true],
    ["  Dad@Gmail.com  ", true],
    ["first.last+tag@sub.gmail.co.uk", true],
    ["dad@gmail", false],
    ["@gmail.com", false],
    ["x<victim@gmail.com>", false],
    ['"evil"<victim@gmail.com>', false],
    ["a,b@gmail.com", false],
    ["a\u0000b@gmail.com", false],
    [`${"x".repeat(65)}@gmail.com`, false],
    ["", false],
  ])("%j -> %s", (email, expected) => {
    expect(isPlausibleEmail(email)).toBe(expected);
  });

  it("collapses control characters and line separators to single spaces", () => {
    expect(stripControlChars("a\r\nb\tc d")).toBe("a b c d");
    expect(stripControlChars("  plain  ")).toBe("plain");
  });
});
