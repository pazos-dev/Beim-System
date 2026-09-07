// Caja: GET estado + POST abrir/cerrar. Both POST actions are thin
// delegates to CajaUseCases.
import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createCajaUseCases } from "../../../../src/server/composition/caja";
import { AuthService, type AuthActor } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { cajaEstadoQuerySchema, toCajaActor } from "../../../../src/server/use-cases/caja";

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
  const parsed = cajaEstadoQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const useCases = createCajaUseCases(dataDirectory());
  const estado = await useCases.getEstado(toCajaActor(resolved.actor), parsed.data);
  if (!estado.ok) {
    return NextResponse.json({ ok: false, error: estado.error }, { status: getHttpStatus(estado.error.code) });
  }
  return NextResponse.json({ ok: true, data: estado.value }, { status: 200 });
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
  const input = parsed.data;
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const useCases = createCajaUseCases(dataDirectory());

  if (input.accion === "abrir") {
    const opened = await useCases.abrir(
      toCajaActor(resolved.actor),
      { fecha: input.fecha, apertura: input.apertura },
      idempotencyKey
    );
    if (!opened.ok) {
      return NextResponse.json({ ok: false, error: opened.error }, { status: getHttpStatus(opened.error.code) });
    }
    return NextResponse.json({ ok: true, data: opened.value }, { status: 201 });
  }

  const closed = await useCases.cerrar(
    toCajaActor(resolved.actor),
    { contado: input.contado, retiros: input.retiros },
    idempotencyKey
  );
  if (!closed.ok) {
    return NextResponse.json({ ok: false, error: closed.error }, { status: getHttpStatus(closed.error.code) });
  }
  return NextResponse.json({ ok: true, data: closed.value }, { status: 200 });
}
