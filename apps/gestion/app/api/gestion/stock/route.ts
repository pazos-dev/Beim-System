import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors.js";
import { AuthService } from "../../../../src/server/handlers/auth.js";
import { createStockStores, StockHandler, toStockActor } from "../../../../src/server/handlers/stock.js";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session.js";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

const stockQuerySchema = z.object({
  productoId: z.string().min(1).max(100),
  deposito: z.string().trim().min(1).max(40).optional()
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const query = request.nextUrl.searchParams;
  const parsed = stockQuerySchema.safeParse({ productoId: query.get("productoId") ?? undefined, deposito: query.get("deposito") ?? undefined });
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const handler = new StockHandler(createStockStores(dataDirectory()));
  const level = await handler.getStock(toStockActor(session.value), parsed.data.productoId, parsed.data.deposito);
  if (!level.ok) {
    return NextResponse.json({ ok: false, error: level.error }, { status: getHttpStatus(level.error.code) });
  }
  return NextResponse.json({ ok: true, data: level.value }, { status: 200 });
}
