import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createStockUseCases } from "../../../../../src/server/composition/stock";
import { toStockActor } from "../../../../../src/server/use-cases/stock";

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
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const useCases = createStockUseCases(dataDirectory());
  const recorded = await useCases.recordOutflow(toStockActor(session.value), body, idempotencyKey);
  if (!recorded.ok) {
    return NextResponse.json({ ok: false, error: recorded.error }, { status: getHttpStatus(recorded.error.code) });
  }
  return NextResponse.json({ ok: true, data: recorded.value }, { status: 201 });
}
