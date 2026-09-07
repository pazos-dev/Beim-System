import { NextResponse, type NextRequest } from "next/server";

import { AuthService, tokenFromCookie } from "../../../../../src/server/handlers/auth";
import { getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import {
  resolveConsoleApiBaseUrl,
  revokeConsoleSession
} from "../../../../../src/server/shared/api-console-session";
import { getApiBearer } from "../../../../../src/server/shared/session-store";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  // Best-effort console revoke before the local delete. Revoke never throws,
  // so logout cannot fail because the console API is down.
  const sessionToken = cookieValue === undefined ? null : tokenFromCookie(cookieValue);
  if (sessionToken !== null) {
    const bearer = getApiBearer(sessionToken);
    if (bearer !== undefined) {
      await revokeConsoleSession({ baseUrl: resolveConsoleApiBaseUrl(), token: bearer.token });
    }
  }
  const service = new AuthService();
  const result = await service.logout(cookieValue);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: getHttpStatus(result.error.code) });
  }
  const response = NextResponse.json({ ok: true, data: result.value }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return response;
}
