import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { JsonStore } from "../../../../../src/server/data/json-store";
import { AuthService, usersDocumentSchema } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME, getSessionMaxAgeSeconds } from "../../../../../src/server/handlers/session";

const devLoginSchema = z.object({ username: z.string().trim().min(1).max(100) });

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: createGestionError(ERROR_CODES.FORBIDDEN) }, { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = devLoginSchema.safeParse(raw);
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const dataDirectory = process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
  const service = new AuthService(dataDirectory);
  const stored = await new JsonStore(join(dataDirectory, "users.json"), usersDocumentSchema).read();
  if (!stored.ok) {
    const error = createGestionError(ERROR_CODES.STORAGE_ERROR);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
  const candidate = stored.value.users.find((user) => user.username === parsed.data.username);
  if (!candidate?.active) {
    const denied = await service.login({ username: parsed.data.username, credential: "__dev_invalid__" });
    const error = denied.ok ? createGestionError(ERROR_CODES.AUTHENTICATION_REQUIRED) : denied.error;
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const result = await service.login({ username: candidate.username, credential: candidate.credential });
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
  return response;
}
