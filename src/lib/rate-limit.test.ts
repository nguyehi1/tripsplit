import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `src/lib/rate-limit.ts` reads UPSTASH_REDIS_REST_URL/TOKEN at module-import time, and vitest
 * doesn't load .env.local into process.env the way `next dev`/Vercel do. Parsed manually here so
 * these tests exercise the real Upstash-backed sliding window (per
 * docs/security-fix-2026-09-17-qa-report.md), not just the "no credentials configured" branches.
 * If .env.local doesn't have Upstash credentials in this environment, the Upstash-dependent tests
 * are skipped rather than silently passing against the wrong code path.
 */
function loadDotEnvLocal(): Record<string, string> {
  const envPath = path.resolve(__dirname, "../../.env.local");
  if (!existsSync(envPath)) return {};
  const contents = readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const raw = match[2].trim();
      const unquoted = /^"(.*)"$|^'(.*)'$/.exec(raw);
      vars[match[1]] = unquoted ? (unquoted[1] ?? unquoted[2]) : raw;
    }
  }
  return vars;
}

const dotEnvLocal = loadDotEnvLocal();
const hasUpstashCreds = Boolean(dotEnvLocal.UPSTASH_REDIS_REST_URL && dotEnvLocal.UPSTASH_REDIS_REST_TOKEN);
const describeIfUpstash = hasUpstashCreds ? describe : describe.skip;

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
};

/**
 * Next.js's global type augmentation declares `NODE_ENV` as `readonly`, since app code should
 * never need to change it — but these tests need to flip it to exercise both the production
 * fail-closed branch and the dev/test skip branch of `enforceRateLimit`. Cast through a
 * mutable-typed view of `process.env` rather than `@ts-expect-error`-ing every assignment.
 */
const mutableEnv = process.env as { NODE_ENV: string };

function restoreEnv() {
  mutableEnv.NODE_ENV = originalEnv.NODE_ENV ?? "test";
  if (originalEnv.UPSTASH_REDIS_REST_URL === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
  else process.env.UPSTASH_REDIS_REST_URL = originalEnv.UPSTASH_REDIS_REST_URL;
  if (originalEnv.UPSTASH_REDIS_REST_TOKEN === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
  else process.env.UPSTASH_REDIS_REST_TOKEN = originalEnv.UPSTASH_REDIS_REST_TOKEN;
}

/** A fresh, never-before-used key per test so real Upstash state from prior runs can't leak in. */
function uniqueKey(label: string) {
  return `qa-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function requestFromIp(ip: string) {
  return new Request("http://localhost/api/whatever", { headers: { "x-forwarded-for": ip } });
}

describeIfUpstash("enforceRateLimit (real Upstash-backed sliding window)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.UPSTASH_REDIS_REST_URL = dotEnvLocal.UPSTASH_REDIS_REST_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = dotEnvLocal.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("allows requests under the limit and blocks with 429 + Retry-After once the limit is exceeded", async () => {
    const { enforceRateLimit } = await import("./rate-limit");
    const key = uniqueKey("basic");
    const options = { key, limit: 3, windowSeconds: 10 };
    const ip = "203.0.113.10";

    const first = await enforceRateLimit(requestFromIp(ip), options);
    const second = await enforceRateLimit(requestFromIp(ip), options);
    const third = await enforceRateLimit(requestFromIp(ip), options);
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(third).toBeNull();

    const fourth = await enforceRateLimit(requestFromIp(ip), options);
    expect(fourth).not.toBeNull();
    expect(fourth?.status).toBe(429);
    const retryAfter = fourth?.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
    expect(Number(retryAfter)).toBeLessThanOrEqual(10);
    const body = await fourth?.json();
    expect(body).toEqual({ error: "Too many requests." });

    // Still over limit on a subsequent call within the same window.
    const fifth = await enforceRateLimit(requestFromIp(ip), options);
    expect(fifth?.status).toBe(429);
  }, 20000);

  it("keys the limit per IP: a different caller isn't affected by another IP's exhausted bucket", async () => {
    const { enforceRateLimit } = await import("./rate-limit");
    const key = uniqueKey("per-ip");
    const options = { key, limit: 1, windowSeconds: 10 };

    const exhausted = await enforceRateLimit(requestFromIp("198.51.100.1"), options);
    expect(exhausted).toBeNull();
    const blocked = await enforceRateLimit(requestFromIp("198.51.100.1"), options);
    expect(blocked?.status).toBe(429);

    // A different IP under the same rate-limit key has its own bucket.
    const otherIp = await enforceRateLimit(requestFromIp("198.51.100.2"), options);
    expect(otherIp).toBeNull();
  }, 20000);

  it("keys the limit per rate-limit `key`: the same IP under a different feature key has its own bucket", async () => {
    const { enforceRateLimit } = await import("./rate-limit");
    const ip = "203.0.113.55";
    const keyA = uniqueKey("feature-a");
    const keyB = uniqueKey("feature-b");

    const a = await enforceRateLimit(requestFromIp(ip), { key: keyA, limit: 1, windowSeconds: 10 });
    expect(a).toBeNull();
    const aAgain = await enforceRateLimit(requestFromIp(ip), { key: keyA, limit: 1, windowSeconds: 10 });
    expect(aAgain?.status).toBe(429);

    const b = await enforceRateLimit(requestFromIp(ip), { key: keyB, limit: 1, windowSeconds: 10 });
    expect(b).toBeNull();
  }, 20000);
});

describe("enforceRateLimit (credentials unavailable)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  afterEach(() => {
    restoreEnv();
  });

  it("fails closed with a 503 in production when Upstash credentials aren't configured", async () => {
    mutableEnv.NODE_ENV = "production";
    const { enforceRateLimit } = await import("./rate-limit");
    const result = await enforceRateLimit(requestFromIp("203.0.113.99"), {
      key: uniqueKey("prod-no-creds"),
      limit: 10,
      windowSeconds: 60,
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe(503);
  });

  it("skips limiting outside production when Upstash credentials aren't configured", async () => {
    mutableEnv.NODE_ENV = "test";
    const { enforceRateLimit } = await import("./rate-limit");
    const result = await enforceRateLimit(requestFromIp("203.0.113.99"), {
      key: uniqueKey("dev-no-creds"),
      limit: 1,
      windowSeconds: 60,
    });
    expect(result).toBeNull();
  });
});

describe("isDbRateLimitError / dbRateLimitResponse", () => {
  it("recognizes the exact message throttle_rpc raises (migration 0013), and only messages starting with it", async () => {
    const { isDbRateLimitError } = await import("./rate-limit");
    expect(isDbRateLimitError(new Error("rate limited: try again shortly"))).toBe(true);
    expect(isDbRateLimitError(new Error("rate limited"))).toBe(true);
    expect(isDbRateLimitError(new Error("invalid invite code"))).toBe(false);
    expect(isDbRateLimitError(new Error("column reference \"window_start\" is ambiguous"))).toBe(false);
    expect(isDbRateLimitError("rate limited: try again shortly")).toBe(false);
    expect(isDbRateLimitError(null)).toBe(false);
  });

  it("echoes the caller-supplied window as Retry-After, since that value isn't recoverable from the caught error", async () => {
    const { dbRateLimitResponse } = await import("./rate-limit");
    const res = dbRateLimitResponse(60);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "Too many requests." });

    const other = dbRateLimitResponse(10);
    expect(other.headers.get("Retry-After")).toBe("10");
  });
});
