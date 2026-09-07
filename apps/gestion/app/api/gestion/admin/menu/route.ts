// Admin menu: GET tree + POST create. Thin delegates to AdminUseCases.
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminUseCases } from "../../../../../src/server/composition/admin";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { toAdminActor } from "../../../../../src/server/use-cases/admin";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const menu = await createAdminUseCases(dataDirectory()).getMenu(toAdminActor(session.value));
  if (!menu.ok) return NextResponse.json({ ok: false, error: menu.error }, { status: getHttpStatus(menu.error.code) });
  return NextResponse.json({ ok: true, data: menu.value }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const created = await createAdminUseCases(dataDirectory()).createNode(
    toAdminActor(session.value),
    body,
    request.headers.get("x-idempotency-key") ?? undefined
  );
  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: getHttpStatus(created.error.code) });
  return NextResponse.json({ ok: true, data: created.value }, { status: 201 });
}
