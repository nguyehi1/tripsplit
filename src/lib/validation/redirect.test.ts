import { describe, expect, it } from "vitest";
import { sanitizeInternalPath } from "./redirect";

describe("sanitizeInternalPath", () => {
  it("passes through a plain internal path", () => {
    expect(sanitizeInternalPath("/trips", "/")).toBe("/trips");
  });

  it("passes through an internal path with a query string", () => {
    expect(sanitizeInternalPath("/trip/abc?tab=list", "/")).toBe("/trip/abc?tab=list");
  });

  it("falls back for a missing value", () => {
    expect(sanitizeInternalPath(null, "/trips")).toBe("/trips");
    expect(sanitizeInternalPath(undefined, "/trips")).toBe("/trips");
    expect(sanitizeInternalPath("", "/trips")).toBe("/trips");
  });

  it("falls back for an absolute external URL", () => {
    expect(sanitizeInternalPath("https://evil.example/phish", "/")).toBe("/");
  });

  it("falls back for a protocol-relative URL", () => {
    expect(sanitizeInternalPath("//evil.example/phish", "/")).toBe("/");
  });

  it("falls back for a backslash-prefixed URL some browsers treat as protocol-relative", () => {
    expect(sanitizeInternalPath("/\\evil.example", "/")).toBe("/");
  });

  it("falls back for a value that doesn't start with a slash", () => {
    expect(sanitizeInternalPath("evil.example", "/")).toBe("/");
    expect(sanitizeInternalPath("javascript:alert(1)", "/")).toBe("/");
  });

  it("falls back for an embedded scheme even if path-prefixed", () => {
    expect(sanitizeInternalPath("/redirect?to=https://evil.example", "/")).toBe("/");
  });
});
