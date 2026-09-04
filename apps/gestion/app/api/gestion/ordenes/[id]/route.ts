// GET + PATCH /api/gestion/ordenes/[id]. PATCH recibe { estado?,
// paymentStatus?, expectedVersion } y aplica control optimista de
// concurrencia; una version vieja o una transicion invalida devuelven
// CONFLICT sin mutar. Sesion obligatoria, sin secretos en la respuesta.
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors.js";
import { AuthService } from "../../../../../src/server/handlers/auth.js";
import { createOrderStores, OrderHandler, toOrderActor } from "../../../../../src/server/handlers/orders.js";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session.js";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const handler = new OrderHandler(createOrderStores(dataDirectory()));
  const found = await handler.getById(toOrderActor(session.value), id);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: getHttpStatus(found.error.code) });
  }
  return NextResponse.json({ ok: true, data: found.value }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
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
  if (typeof body !== "object" || body === null || !("expectedVersion" in body)) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const { expectedVersion, ...patch } = body as { expectedVersion: unknown };
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const handler = new OrderHandler(createOrderStores(dataDirectory()));
  const updated = await handler.update(toOrderActor(session.value), id, patch, expectedVersion);
  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: getHttpStatus(updated.error.code) });
  }
  return NextResponse.json({ ok: true, data: updated.value }, { status: 200 });
}
