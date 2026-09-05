// Caja: GET estado + POST abrir/cerrar. Rutas delgadas: sesion de
// AuthService, envelope compartido, dominio puro en lib/domain/cash.
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { computeExpected } from "../../../../src/lib/domain/cash/cash.js";
import { JsonStore, JSON_STORE_ERROR_REASONS } from "../../../../src/server/data/json-store.js";
import {
  gastosDocumentSchema,
  sesionesCajaDocumentSchema,
  sesionCajaSchema,
  ventasDocumentSchema,
  type Gasto,
  type SesionCaja,
  type Venta
} from "../../../../src/server/data/schemas.js";
import { AuditRepository, buildAuditEvent } from "../../../../src/server/handlers/audit.js";
import { auditDocumentSchema } from "../../../../src/server/data/schemas.js";
import { AuthService, type AuthActor } from "../../../../src/server/handlers/auth.js";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors.js";
import { err, ok, type Result } from "../../../../src/server/handlers/result.js";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session.js";
import type { GestionError } from "../../../../src/server/data/schemas.js";

type SesionesDocument = z.infer<typeof sesionesCajaDocumentSchema>;
type VentasDocument = z.infer<typeof ventasDocumentSchema>;
type GastosDocument = z.infer<typeof gastosDocumentSchema>;

const CASH_ROLES: ReadonlySet<AuthActor["role"]> = new Set(["caja", "administrador", "administrador_principal"]);

const abrirSchema = z.object({
  accion: z.literal("abrir"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "The date must be YYYY-MM-DD." }),
  apertura: z.number().min(0)
});

const cerrarSchema = z.object({
  accion: z.literal("cerrar"),
  contado: z.number().min(0),
  retiros: z.number().min(0).default(0)
});

const cajaInputSchema = z.discriminatedUnion("accion", [abrirSchema, cerrarSchema]);

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

interface CashStores {
  sesiones: JsonStore<SesionesDocument>;
  ventas: JsonStore<VentasDocument>;
  gastos: JsonStore<GastosDocument>;
  audit: AuditRepository;
}

function cashStores(directory: string): CashStores {
  return {
    sesiones: new JsonStore(join(directory, "sesiones-caja.json"), sesionesCajaDocumentSchema),
    ventas: new JsonStore(join(directory, "ventas.json"), ventasDocumentSchema),
    gastos: new JsonStore(join(directory, "gastos.json"), gastosDocumentSchema),
    audit: new AuditRepository(new JsonStore(join(directory, "audit.json"), auditDocumentSchema))
  };
}

function isGlobal(actor: AuthActor): boolean {
  return actor.role === "administrador" || actor.role === "administrador_principal";
}

function visibleVentas(actor: AuthActor, ventas: Venta[]): Venta[] {
  return isGlobal(actor) ? ventas : ventas.filter((venta) => venta.ownerId === actor.id);
}

function visibleGastos(actor: AuthActor, gastos: Gasto[]): Gasto[] {
  return isGlobal(actor) ? gastos : gastos.filter((gasto) => gasto.ownerId === actor.id);
}

async function readOrEmpty<T extends { version: number }>(store: JsonStore<T>, fallback: T): Promise<Result<T, GestionError>> {
  const current = await store.read();
  if (current.ok) return current;
  if (current.error.reason === JSON_STORE_ERROR_REASONS.NOT_FOUND) return ok(fallback);
  return err(createGestionError(ERROR_CODES.STORAGE_ERROR));
}

function openSession(actor: AuthActor, sesiones: SesionCaja[]): SesionCaja | undefined {
  return sesiones.find((sesion) => sesion.estado === "abierta" && (isGlobal(actor) || sesion.ownerId === actor.id));
}

async function resolveActor(request: NextRequest): Promise<{ actor: AuthActor } | { response: NextResponse }> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return { response: NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) }) };
  }
  if (!CASH_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return { response: NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) }) };
  }
  return { actor: session.value };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const resolved = await resolveActor(request);
  if ("response" in resolved) return resolved.response;
  const stores = cashStores(dataDirectory());
  const [sesiones, ventas, gastos] = await Promise.all([
    readOrEmpty(stores.sesiones, { version: 0, sesionesCaja: [] }),
    readOrEmpty(stores.ventas, { version: 0, ventas: [] }),
    readOrEmpty(stores.gastos, { version: 0, gastos: [] })
  ]);
  if (!sesiones.ok) return NextResponse.json({ ok: false, error: sesiones.error }, { status: getHttpStatus(sesiones.error.code) });
  if (!ventas.ok) return NextResponse.json({ ok: false, error: ventas.error }, { status: getHttpStatus(ventas.error.code) });
  if (!gastos.ok) return NextResponse.json({ ok: false, error: gastos.error }, { status: getHttpStatus(gastos.error.code) });
  const abierta = openSession(resolved.actor, sesiones.value.sesionesCaja);
  // Ventas v1 have no timestamp: every confirmed sale counts; dated gastos
  // filter by the open session day, otherwise by nothing (no open session).
  const dayGastos = abierta === undefined ? [] : visibleGastos(resolved.actor, gastos.value.gastos).filter((gasto) => gasto.fecha.slice(0, 10) === abierta.fecha);
  const expected = computeExpected({ apertura: abierta?.apertura ?? 0, ventas: visibleVentas(resolved.actor, ventas.value.ventas), gastos: dayGastos, retiros: 0 });
  return NextResponse.json({ ok: true, data: { abierta: abierta !== undefined, sesion: abierta ?? null, esperado: expected.esperado, porMetodo: expected.porMetodo } }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const resolved = await resolveActor(request);
  if ("response" in resolved) return resolved.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = cajaInputSchema.safeParse(body);
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: parsed.error.issues.map((issue) => issue.path.join(".")) });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const stores = cashStores(dataDirectory());
  const [sesiones, ventas, gastos] = await Promise.all([
    readOrEmpty(stores.sesiones, { version: 0, sesionesCaja: [] }),
    readOrEmpty(stores.ventas, { version: 0, ventas: [] }),
    readOrEmpty(stores.gastos, { version: 0, gastos: [] })
  ]);
  if (!sesiones.ok) return NextResponse.json({ ok: false, error: sesiones.error }, { status: getHttpStatus(sesiones.error.code) });
  if (!ventas.ok) return NextResponse.json({ ok: false, error: ventas.error }, { status: getHttpStatus(ventas.error.code) });
  if (!gastos.ok) return NextResponse.json({ ok: false, error: gastos.error }, { status: getHttpStatus(gastos.error.code) });
  const input = parsed.data;

  if (input.accion === "abrir") {
    if (openSession(resolved.actor, sesiones.value.sesionesCaja) !== undefined) {
      const error = createGestionError(ERROR_CODES.CONFLICT);
      return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
    }
    const dayGastos = visibleGastos(resolved.actor, gastos.value.gastos).filter((gasto) => gasto.fecha.slice(0, 10) === input.fecha);
    const expected = computeExpected({ apertura: input.apertura, ventas: visibleVentas(resolved.actor, ventas.value.ventas), gastos: dayGastos, retiros: 0 });
    const candidate = sesionCajaSchema.safeParse({ id: `sc_${randomUUID()}`, ownerId: resolved.actor.id, version: 1, fecha: input.fecha, apertura: input.apertura, esperado: expected.esperado, contado: 0, diferencia: 0, estado: "abierta" });
    if (!candidate.success) {
      const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
      return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
    }
    const next: SesionesDocument = { version: sesiones.value.version + 1, sesionesCaja: [...sesiones.value.sesionesCaja, candidate.data] };
    const written = await stores.sesiones.write(next, sesiones.value.version);
    if (!written.ok) {
      const error = createGestionError(written.error.code === "CONFLICT" ? ERROR_CODES.CONFLICT : ERROR_CODES.STORAGE_ERROR);
      return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
    }
    await stores.audit.append(buildAuditEvent({ actorId: resolved.actor.id, accion: "caja.abrir", entidad: "sesion-caja", entidadId: candidate.data.id, detalles: { fecha: candidate.data.fecha, apertura: candidate.data.apertura } }, "ok"));
    return NextResponse.json({ ok: true, data: candidate.data }, { status: 201 });
  }

  const abierta = openSession(resolved.actor, sesiones.value.sesionesCaja);
  if (abierta === undefined) {
    const error = createGestionError(ERROR_CODES.CONFLICT);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const dayGastos = visibleGastos(resolved.actor, gastos.value.gastos).filter((gasto) => gasto.fecha.slice(0, 10) === abierta.fecha);
  const close = computeExpected({ apertura: abierta.apertura, ventas: visibleVentas(resolved.actor, ventas.value.ventas), gastos: dayGastos, retiros: input.retiros });
  const diferencia = input.contado - close.esperado;
  const resultado = diferencia > 0 ? "sobrante" : diferencia < 0 ? "faltante" : "exacto";
  const candidate = sesionCajaSchema.safeParse({ ...abierta, esperado: close.esperado, contado: input.contado, diferencia, estado: "cerrada", cierre: new Date().toISOString(), version: abierta.version + 1 });
  if (!candidate.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const next: SesionesDocument = { version: sesiones.value.version + 1, sesionesCaja: sesiones.value.sesionesCaja.map((sesion) => sesion.id === abierta.id ? candidate.data : sesion) };
  const written = await stores.sesiones.write(next, sesiones.value.version);
  if (!written.ok) {
    const error = createGestionError(written.error.code === "CONFLICT" ? ERROR_CODES.CONFLICT : ERROR_CODES.STORAGE_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  await stores.audit.append(buildAuditEvent({ actorId: resolved.actor.id, accion: "caja.cerrar", entidad: "sesion-caja", entidadId: abierta.id, detalles: { esperado: close.esperado, contado: input.contado, diferencia, resultado } }, "ok"));
  return NextResponse.json({ ok: true, data: candidate.data }, { status: 200 });
}
