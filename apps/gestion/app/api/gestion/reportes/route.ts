// Reportes: GET ?desde=&hasta=&formato=json|csv. Thin delegate to
// ReporteUseCases: visible snapshot and CSV come from the same
// buildPeriodSnapshot via the use case; CSV only adds attachment.
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { createReporteUseCases } from "../../../../src/server/composition/reportes";
import { AuthService, type AuthActor } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { reporteQuerySchema, toReporteActor } from "../../../../src/server/use-cases/reportes";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";

const REPORT_ROLES: ReadonlySet<AuthActor["role"]> = new Set(["caja", "administrador", "administrador_principal"]);

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

export async function GET(request: NextRequest): Promise<NextResponse | Response> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  if (!REPORT_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = reporteQuerySchema.safeParse({
    desde: request.nextUrl.searchParams.get("desde"),
    hasta: request.nextUrl.searchParams.get("hasta"),
    formato: request.nextUrl.searchParams.get("formato") ?? undefined
  });
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const useCases = createReporteUseCases(dataDirectory());
  const read = await useCases.getSnapshot(toReporteActor(session.value), parsed.data);
  if (!read.ok) {
    return NextResponse.json({ ok: false, error: read.error }, { status: getHttpStatus(read.error.code) });
  }
  if (read.value.formato === "csv") {
    return new Response(useCases.toCsv(read.value.snapshot), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="reporte-${parsed.data.desde}-${parsed.data.hasta}.csv"`
      }
    });
  }
  return NextResponse.json({ ok: true, data: read.value.snapshot }, { status: 200 });
}
