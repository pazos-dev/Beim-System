import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth.js";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors.js";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "../../../../../src/server/handlers/session.js";

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
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}
