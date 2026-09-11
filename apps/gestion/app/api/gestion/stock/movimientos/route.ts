import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { outflowInputSchema } from "../../../../../src/lib/domain/inventory/inventory";
import {
  STOCK_OUTFLOW_ROLES,
  STOCK_PRINCIPAL_ROLE
} from "../../../../../src/lib/domain/inventory/stock-roles";
import { NEXT_IMPLEMENTATION_MESSAGE } from "../../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, NEXT_IMPLEMENTATION_MESSAGE) },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
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
  const parsed = outflowInputSchema.safeParse(body);
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const idempotencyKey = request.headers.get("x-idempotency-key");
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim() === "") {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["x-idempotency-key"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  if (!STOCK_OUTFLOW_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  if (parsed.data.ajuste && session.value.role !== STOCK_PRINCIPAL_ROLE) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  void idempotencyKey;
  return nextImplementationResponse();
}
