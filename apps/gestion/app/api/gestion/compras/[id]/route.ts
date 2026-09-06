import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { createStockUseCases } from "../../../../../src/server/composition/stock";
import { toStockActor } from "../../../../../src/server/use-cases/stock";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";

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
  const found = await createStockUseCases(dataDirectory()).getCompraById(toStockActor(session.value), id);
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
  // Thin delegate: the stock use case owns key/motivo validation, the
  // insufficient-balance guard, reversal persistence, and compra.anular audit.
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const anulled = await createStockUseCases(dataDirectory()).anularCompra(
    toStockActor(session.value),
    id,
    body,
    idempotencyKey
  );
  if (!anulled.ok) {
    return NextResponse.json({ ok: false, error: anulled.error }, { status: getHttpStatus(anulled.error.code) });
  }
  return NextResponse.json({ ok: true, data: anulled.value }, { status: 200 });
}
