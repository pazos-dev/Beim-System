import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { AuthService } from "../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { createRemoteStockUseCases } from "../../../../src/server/composition/stock";
import { compraListQuerySchema, toStockActor } from "../../../../src/server/use-cases/stock";
import { purchaseInputSchema } from "../../../../src/lib/domain/inventory/inventory";
import { STOCK_WRITE_ROLES } from "../../../../src/lib/domain/inventory/stock-roles";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: createGestionError(ERROR_CODES.DEPENDENCY_UNAVAILABLE, undefined, NEXT_IMPLEMENTATION_MESSAGE) },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const parsed = compraListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  if (!STOCK_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const context = resolveGestionApiContext(cookieValue);
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: getHttpStatus(context.error.code) });
  }
  const listed = await createRemoteStockUseCases(context.value).listCompras(toStockActor(session.value), parsed.data);
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
  if (!STOCK_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = purchaseInputSchema.safeParse(body);
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
  return nextImplementationResponse();
}
