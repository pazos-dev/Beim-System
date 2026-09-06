import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createClienteUseCases } from "../../../../../src/server/composition/clientes";
import { toClienteActor } from "../../../../../src/server/use-cases/clientes";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

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
  const useCases = createClienteUseCases(dataDirectory());
  const found = await useCases.getById(toClienteActor(session.value), id);
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
  const useCases = createClienteUseCases(dataDirectory());
  const updated = await useCases.update(
    toClienteActor(session.value),
    id,
    patch,
    expectedVersion,
    idempotencyKey
  );
  if (!updated.ok) {
    return NextResponse.json({ ok: false, error: updated.error }, { status: getHttpStatus(updated.error.code) });
  }
  return NextResponse.json({ ok: true, data: updated.value }, { status: 200 });
}

export async function PATCH(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  return handleUpdate(request, id);
}

export async function PUT(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  return handleUpdate(request, id);
}

export async function DELETE(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const idempotencyKey = request.headers.get("x-idempotency-key") ?? undefined;
  const useCases = createClienteUseCases(dataDirectory());
  const removed = await useCases.remove(toClienteActor(session.value), id, idempotencyKey);
  if (!removed.ok) {
    return NextResponse.json({ ok: false, error: removed.error }, { status: getHttpStatus(removed.error.code) });
  }
  return NextResponse.json({ ok: true, data: { id } }, { status: 200 });
}
