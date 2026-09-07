export const SESSION_COOKIE_NAME = "gestion_session";
export const GESTION_SESSION_COOKIE = SESSION_COOKIE_NAME;
export const SESSION_COOKIE_VERSION = "v1";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const SESSION_SLIDING_WINDOW_SECONDS = 8 * 60 * 60;

function readPositiveIntSeconds(envValue: string | undefined, fallback: number): number {
  if (envValue === undefined || envValue.trim() === "") {
    return fallback;
  }
  const parsed = Number(envValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

// NOTA (seguridad): no se implementa sesión "infinita"; toda sesión conserva un tope absoluto
// (createdAt + Max-Age) aunque haya actividad. Para sesiones largas en dev, elevar ambas variables
// (p. ej. GESTION_SESSION_MAX_AGE_SECONDS=604800 y GESTION_SESSION_SLIDING_SECONDS=604800);
// valores ausentes o inválidos vuelven al default de 8 h.
export function getSessionMaxAgeSeconds(): number {
  return readPositiveIntSeconds(process.env.GESTION_SESSION_MAX_AGE_SECONDS, SESSION_MAX_AGE_SECONDS);
}

export function getSessionSlidingSeconds(): number {
  return readPositiveIntSeconds(process.env.GESTION_SESSION_SLIDING_SECONDS, SESSION_SLIDING_WINDOW_SECONDS);
}

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
