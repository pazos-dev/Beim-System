import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { createStockStores, StockHandler, toStockActor } from "../../../../../src/server/handlers/stock";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";

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
  const handler = new StockHandler(createStockStores(dataDirectory()));
  const transferred = await handler.transfer(toStockActor(session.value), body);
  if (!transferred.ok) {
    return NextResponse.json({ ok: false, error: transferred.error }, { status: getHttpStatus(transferred.error.code) });
  }
  return NextResponse.json({ ok: true, data: transferred.value }, { status: 201 });
}
