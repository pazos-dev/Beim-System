export const SESSION_COOKIE_NAME = "gestion_session";
export const GESTION_SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_COOKIE_VERSION = "v1";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function isLoginBypassActive(): boolean {
  return process.env.BEIM_BYPASS_LOGIN === "1" && process.env.NODE_ENV !== "production";
}

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const SESSION_EXPIRY_PATTERN = /^\d{10}$/;

export function createSessionCookieValue(
  sessionId: string,
  expiresAt: Date = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
): string {
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);

  if (!SESSION_TOKEN_PATTERN.test(sessionId) || !Number.isSafeInteger(expiresAtSeconds)) {
    throw new Error("Invalid session cookie value.");
  }

  return `${SESSION_COOKIE_VERSION}.${expiresAtSeconds}.${sessionId}`;
}

export function isSessionCookieFormatValid(
  value: string,
  now: Date = new Date()
): boolean {
  const [version, expiry, sessionId, ...extraParts] = value.split(".");
  if (
    extraParts.length > 0 ||
    version !== SESSION_COOKIE_VERSION ||
    !SESSION_EXPIRY_PATTERN.test(expiry ?? "") ||
    !SESSION_TOKEN_PATTERN.test(sessionId ?? "")
  ) {
    return false;
  }

  const expiresAtSeconds = Number(expiry);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  return Number.isSafeInteger(expiresAtSeconds) && expiresAtSeconds > nowSeconds;
}
