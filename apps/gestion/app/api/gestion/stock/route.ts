import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { createRemoteStockUseCases } from "../../../../src/server/composition/stock";
import { stockListQuerySchema, toStockActor } from "../../../../src/server/use-cases/stock";
import { resolveGestionApiContext } from "../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const parsed = stockListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const context = resolveGestionApiContext(cookieValue);
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: getHttpStatus(context.error.code) });
  }
  const useCases = createRemoteStockUseCases(context.value);
  const levels = await useCases.getLevels(toStockActor(session.value), parsed.data);
  if (!levels.ok) {
    return NextResponse.json({ ok: false, error: levels.error }, { status: getHttpStatus(levels.error.code) });
  }
  return NextResponse.json({ ok: true, data: levels.value }, { status: 200 });
}
