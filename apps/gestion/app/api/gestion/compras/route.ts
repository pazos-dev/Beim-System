import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { AuthService } from "../../../../src/server/handlers/auth";
import { createStockUseCases } from "../../../../src/server/composition/stock";
import { toStockActor } from "../../../../src/server/use-cases/stock";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
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
  // Thin delegate: the stock use case owns idempotency, weighted cost, and atomic triple-write.
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const purchased = await createStockUseCases(dataDirectory()).recordPurchase(
    toStockActor(session.value),
    body,
    idempotencyKey
  );
  if (!purchased.ok) {
    return NextResponse.json({ ok: false, error: purchased.error }, { status: getHttpStatus(purchased.error.code) });
  }
  return NextResponse.json({ ok: true, data: purchased.value }, { status: 201 });
}
