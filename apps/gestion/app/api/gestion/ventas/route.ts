import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors.js";
import { AuthService } from "../../../../src/server/handlers/auth.js";
import { createOrderStores, toOrderActor } from "../../../../src/server/handlers/order-context.js";
import { SalesHandler } from "../../../../src/server/handlers/sales.js";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session.js";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const handler = new SalesHandler(createOrderStores(dataDirectory()));
  const listed = await handler.list(toOrderActor(session.value));
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: getHttpStatus(listed.error.code) });
  }
  return NextResponse.json({ ok: true, data: listed.value }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const handler = new SalesHandler(createOrderStores(dataDirectory()));
  const created = await handler.create(toOrderActor(session.value), body, idempotencyKey);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: getHttpStatus(created.error.code) });
  }
  return NextResponse.json({ ok: true, data: created.value }, { status: 201 });
}
