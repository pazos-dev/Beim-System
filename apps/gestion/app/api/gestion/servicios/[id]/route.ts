import { join } from "node:path";

import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createServicioUseCases } from "../../../../../src/server/composition/servicios";
import { toServicioActor } from "../../../../../src/server/use-cases/servicios";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

const servicioDetailQuerySchema = z.object({
  active: z.enum(["true", "false", "all"]).default("true")
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const parsed = servicioDetailQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const useCases = createServicioUseCases(dataDirectory());
  const found = await useCases.getById(toServicioActor(session.value), id, parsed.data.active);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: getHttpStatus(found.error.code) });
  }
  return NextResponse.json({ ok: true, data: found.value }, {
    status: 200,
    headers: { ETag: `W/"v${found.value.version}"` }
  });
}

async function handleUpdate(request: NextRequest, id: string): Promise<NextResponse> {
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
  if (typeof body !== "object" || body === null || !("expectedVersion" in body)) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const { expectedVersion, ...patch } = body as { expectedVersion: unknown };
  if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion)) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["expectedVersion"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const useCases = createServicioUseCases(dataDirectory());
  const actor = toServicioActor(session.value);
  const patchKeys = Object.keys(patch);
  const toggled =
    patchKeys.length === 1 && patchKeys[0] === "active"
      ? await useCases.toggleActive(actor, id, { active: (patch as { active: unknown }).active, expectedVersion }, idempotencyKey)
      : await useCases.update(actor, id, patch, expectedVersion, idempotencyKey);
  if (!toggled.ok) {
    return NextResponse.json({ ok: false, error: toggled.error }, { status: getHttpStatus(toggled.error.code) });
  }
  return NextResponse.json({ ok: true, data: toggled.value }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  return handleUpdate(request, id);
}
