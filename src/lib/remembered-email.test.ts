import { afterEach, describe, expect, it, vi } from "vitest";
import { clearRememberedEmail, getRememberedEmail, setRememberedEmail } from "./remembered-email";

/**
 * `remembered-email.ts` reads `window.localStorage` directly, so these tests install a
 * minimal fake `window` on the global object (vitest here runs with `environment: "node"`,
 * matching the rest of this repo's `src/lib/**` tests — no `window` exists by default).
 */
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return store;
}

function installThrowingLocalStorage() {
  (globalThis as { window?: unknown }).window = {
    get localStorage(): never {
      throw new Error("storage disabled");
    },
  };
}

describe("remembered-email", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    vi.restoreAllMocks();
  });

  it("returns empty string when nothing has been stored yet (AC2 first-visit / empty state)", () => {
    installFakeLocalStorage();
    expect(getRememberedEmail()).toBe("");
  });

  it("round-trips a stored email (AC1 store on success, AC2 prefill on later visit)", () => {
    installFakeLocalStorage();
    setRememberedEmail("pat@example.com");
    expect(getRememberedEmail()).toBe("pat@example.com");
  });

  it("overwrites a previously stored email with the newest one (AC4)", () => {
    installFakeLocalStorage();
    setRememberedEmail("old@example.com");
    setRememberedEmail("new@example.com");
    expect(getRememberedEmail()).toBe("new@example.com");
  });

  it("clears the stored email so a later read returns empty again (AC5)", () => {
    installFakeLocalStorage();
    setRememberedEmail("pat@example.com");
    clearRememberedEmail();
    expect(getRememberedEmail()).toBe("");
  });

  it("uses a namespaced key so it doesn't collide with other localStorage consumers", () => {
    const store = installFakeLocalStorage();
    setRememberedEmail("pat@example.com");
    expect([...store.keys()]).toEqual(["tripsplit:last-signin-email"]);
  });

  it("stores only the raw email string, nothing else (no tokens/metadata, per AC6/non-goals)", () => {
    const store = installFakeLocalStorage();
    setRememberedEmail("pat@example.com");
    expect(store.get("tripsplit:last-signin-email")).toBe("pat@example.com");
  });

  it("getRememberedEmail falls back to '' when localStorage access throws (AC7, e.g. Safari private mode)", () => {
    installThrowingLocalStorage();
    expect(() => getRememberedEmail()).not.toThrow();
    expect(getRememberedEmail()).toBe("");
  });

  it("setRememberedEmail silently no-ops when localStorage access throws (AC7)", () => {
    installThrowingLocalStorage();
    expect(() => setRememberedEmail("pat@example.com")).not.toThrow();
  });

  it("clearRememberedEmail silently no-ops when localStorage access throws (AC7)", () => {
    installThrowingLocalStorage();
    expect(() => clearRememberedEmail()).not.toThrow();
  });

  it("getRememberedEmail falls back to '' when window.localStorage.getItem itself throws", () => {
    const localStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    (globalThis as { window?: unknown }).window = { localStorage };
    expect(getRememberedEmail()).toBe("");
  });
});
