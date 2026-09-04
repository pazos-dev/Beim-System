import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth.js";
import { getHttpStatus } from "../../../../../src/server/handlers/errors.js";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session.js";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
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
