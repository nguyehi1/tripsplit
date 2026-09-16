const KEY = "splitiful:last-signin-email";

export function getRememberedEmail(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setRememberedEmail(email: string): void {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    // storage unavailable/blocked (private browsing, quota, disabled) —
    // fail silently, per AC7.
  }
}

export function clearRememberedEmail(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op, same reasoning as above.
  }
}
