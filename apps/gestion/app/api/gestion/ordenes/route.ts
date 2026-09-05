// Convencion de rutas de ordenes: POST + GET /api/gestion/ordenes y
// GET + PATCH /api/gestion/ordenes/[id]. Toda ruta exige sesion (401),
// actor siempre de sesion, envelope de errores compartido y sin secretos
// en respuestas ni en auditoria (GR-ORDERS.0).
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { AuthService } from "../../../../src/server/handlers/auth";
import {
  createOrderStores,
  orderListViewQuerySchema,
  OrderHandler,
  toOrderActor
} from "../../../../src/server/handlers/orders";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const parsed = orderListViewQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const handler = new OrderHandler(createOrderStores(dataDirectory()));
  const listed = await handler.listView(toOrderActor(session.value), parsed.data);
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
  const handler = new OrderHandler(createOrderStores(dataDirectory()));
  const created = await handler.create(toOrderActor(session.value), body, idempotencyKey ?? undefined);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: getHttpStatus(created.error.code) });
  }
  return NextResponse.json({ ok: true, data: created.value }, { status: 201 });
}
