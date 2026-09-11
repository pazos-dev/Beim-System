import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createRemoteStockUseCases } from "../../../../../src/server/composition/stock";
import { anularCompraInputSchema, toStockActor } from "../../../../../src/server/use-cases/stock";
import { STOCK_WRITE_ROLES } from "../../../../../src/lib/domain/inventory/stock-roles";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, NEXT_IMPLEMENTATION_MESSAGE) },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  if (id.trim() === "") {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  if (!STOCK_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const apiContext = resolveGestionApiContext(cookieValue);
  if (!apiContext.ok) {
    return NextResponse.json({ ok: false, error: apiContext.error }, { status: getHttpStatus(apiContext.error.code) });
  }
  const found = await createRemoteStockUseCases(apiContext.value).getCompraById(toStockActor(session.value), id);
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
  if (!STOCK_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  if (id.trim() === "") {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = anularCompraInputSchema.safeParse(body);
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
  void idempotencyKey;
  void parsed;
  void id;
  return nextImplementationResponse();
}
