/**
 * Cookie helpers for auth persistence.
 * Uses document.cookie (no httpOnly) so the frontend can read the token
 * for Bearer auth headers. SameSite=Lax works for same-site cross-port
 * (localhost:3000 → localhost:4000).
 */

export const AUTH_TOKEN_KEY = "beim_auth_token";
const TOKEN_COOKIE = AUTH_TOKEN_KEY;
const ACTOR_COOKIE = "beim_auth_actor";
const COOKIE_MAX_AGE_DAYS = 30;

function cookieString(name: string, value: string, maxAgeDays: number): string {
  const maxAge = maxAgeDays * 24 * 60 * 60;
  // SameSite=Lax allows cross-port within same host (localhost:3000 → localhost:4000)
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export function setCookie(name: string, value: string, maxAgeDays = COOKIE_MAX_AGE_DAYS): void {
  if (typeof document === "undefined") return;
  document.cookie = cookieString(name, value, maxAgeDays);
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** Read auth token from cookie. */
export function getAuthToken(): string | null {
  return getCookie(TOKEN_COOKIE);
}

/** Store auth token in cookie. */
export function setAuthToken(token: string): void {
  setCookie(TOKEN_COOKIE, token);
}

/** Clear auth token cookie. */
export function clearAuthToken(): void {
  deleteCookie(TOKEN_COOKIE);
}

/** Read actor from cookie. */
export function getAuthActor(): import("./auth-store").UserActor | null {
  const raw = getCookie(ACTOR_COOKIE);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as import("./auth-store").UserActor;
  } catch {
    return null;
  }
}

/** Store actor in cookie. */
export function setAuthActor(actor: import("./auth-store").UserActor): void {
  setCookie(ACTOR_COOKIE, JSON.stringify(actor));
}

/** Clear actor cookie. */
export function clearAuthActor(): void {
  deleteCookie(ACTOR_COOKIE);
}
