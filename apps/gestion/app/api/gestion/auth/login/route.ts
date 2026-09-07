import { NextResponse, type NextRequest } from "next/server";

import { AuthService, tokenFromCookie } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME, getSessionMaxAgeSeconds } from "../../../../../src/server/handlers/session";
import {
  exchangeConsoleLogin,
  resolveConsoleApiBaseUrl
} from "../../../../../src/server/shared/api-console-session";
import { attachApiBearer } from "../../../../../src/server/shared/session-store";

// Reads the plaintext credential once, only to exchange it server-side for a
// console bearer. The credential never leaves this handler except inside the
// server-to-console login call, and never reaches cookies or responses.
function extractConsoleCredential(body: unknown): { username: string; password: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const candidate = body as Record<string, unknown>;
  const username = candidate.username;
  const password = candidate.credential ?? candidate.password;
  if (typeof username !== "string" || typeof password !== "string") return null;
  if (username === "" || password === "") return null;
  return { username, password };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const service = new AuthService();
  const result = await service.login(body);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: getHttpStatus(result.error.code) });
  }
  const response = NextResponse.json({ ok: true, data: result.value.actor }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, result.value.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: getSessionMaxAgeSeconds()
  });
  // Graceful degradation: a failed console exchange keeps the local-only
  // session valid; the cookie and response stay actor-only either way.
  const sessionToken = tokenFromCookie(result.value.cookieValue);
  const credential = extractConsoleCredential(body);
  if (sessionToken !== null && credential !== null) {
    const exchange = await exchangeConsoleLogin({
      baseUrl: resolveConsoleApiBaseUrl(),
      username: credential.username,
      password: credential.password
    });
    if (exchange.ok) {
      attachApiBearer(sessionToken, { token: exchange.value.token, expiresAtMs: exchange.value.expiresAtMs });
    } else {
      console.warn(
        `Console login exchange failed with ${exchange.error.code}; continuing with local-only session.`
      );
    }
  }
  return response;
}
