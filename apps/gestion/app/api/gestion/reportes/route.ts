// Reportes: GET ?desde=&hasta=&formato=json|csv. Visible y CSV salen de la
// misma buildPeriodSnapshot: el CSV serializa el snapshot, no recalcula.
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildPeriodSnapshot, snapshotToCsv } from "../../../../src/lib/domain/reports/reports";
import { JsonStore, JSON_STORE_ERROR_REASONS } from "../../../../src/server/data/json-store";
import {
  comprasDocumentSchema,
  gastosDocumentSchema,
  ventasDocumentSchema,
  type Compra,
  type Gasto,
  type GestionError,
  type Venta
} from "../../../../src/server/data/schemas";
import { AuthService, type AuthActor } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { err, ok, type Result } from "../../../../src/server/handlers/result";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";

type VentasDocument = z.infer<typeof ventasDocumentSchema>;
type ComprasDocument = z.infer<typeof comprasDocumentSchema>;
type GastosDocument = z.infer<typeof gastosDocumentSchema>;

const REPORT_ROLES: ReadonlySet<AuthActor["role"]> = new Set(["caja", "administrador", "administrador_principal"]);

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const reportQuerySchema = z.object({
  desde: z.string().regex(DATE_PATTERN, { error: "The date must be YYYY-MM-DD." }),
  hasta: z.string().regex(DATE_PATTERN, { error: "The date must be YYYY-MM-DD." }),
  formato: z.enum(["json", "csv"]).default("json")
}).refine((query) => query.desde <= query.hasta, { error: "The period must satisfy desde <= hasta." });

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function isGlobal(actor: AuthActor): boolean {
  return actor.role === "administrador" || actor.role === "administrador_principal";
}

async function readOrEmpty<T extends { version: number }>(store: JsonStore<T>, fallback: T): Promise<Result<T, GestionError>> {
  const current = await store.read();
  if (current.ok) return current;
  if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok(fallback);
  return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
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
  const parsed = reportQuerySchema.safeParse({
    desde: request.nextUrl.searchParams.get("desde"),
    hasta: request.nextUrl.searchParams.get("hasta"),
    formato: request.nextUrl.searchParams.get("formato") ?? undefined
  });
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const directory = dataDirectory();
  const [ventas, compras, gastos] = await Promise.all([
    readOrEmpty(new JsonStore(join(directory, "ventas.json"), ventasDocumentSchema), { version: 0, ventas: [] }),
    readOrEmpty(new JsonStore(join(directory, "compras.json"), comprasDocumentSchema), { version: 0, compras: [] }),
    readOrEmpty(new JsonStore(join(directory, "gastos.json"), gastosDocumentSchema), { version: 0, gastos: [] })
  ]);
  if (!ventas.ok) return NextResponse.json({ ok: false, error: ventas.error }, { status: getHttpStatus(ventas.error.code) });
  if (!compras.ok) return NextResponse.json({ ok: false, error: compras.error }, { status: getHttpStatus(compras.error.code) });
  if (!gastos.ok) return NextResponse.json({ ok: false, error: gastos.error }, { status: getHttpStatus(gastos.error.code) });
  const actor = session.value;
  const scope = <T extends Venta | Compra | Gasto>(items: T[]): T[] =>
    isGlobal(actor) ? items : items.filter((item) => item.ownerId === actor.id);
  const snapshot = buildPeriodSnapshot({
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    ventas: scope(ventas.value.ventas),
    compras: scope(compras.value.compras),
    gastos: scope(gastos.value.gastos)
  });
  if (parsed.data.formato === "csv") {
    return new Response(snapshotToCsv(snapshot), { status: 200, headers: { "content-type": "text/csv; charset=utf-8" } });
  }
  return NextResponse.json({ ok: true, data: snapshot }, { status: 200 });
}
