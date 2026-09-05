import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors.js";
import { AuthService } from "../../../../../src/server/handlers/auth.js";
import { createOrderStores, toOrderActor } from "../../../../../src/server/handlers/order-context.js";
import { SalesHandler } from "../../../../../src/server/handlers/sales.js";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session.js";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

interface RouteParams {
  params: Promise<{ id: string }>;
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
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const handler = new SalesHandler(createOrderStores(dataDirectory()));
  const anulada = await handler.anular(toOrderActor(session.value), id, body, idempotencyKey);
  if (!anulada.ok) {
    return NextResponse.json({ ok: false, error: anulada.error }, { status: getHttpStatus(anulada.error.code) });
  }
  return NextResponse.json({ ok: true, data: anulada.value }, { status: 200 });
}
