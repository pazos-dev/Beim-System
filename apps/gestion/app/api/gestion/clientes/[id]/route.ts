import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createRemoteClienteRepository } from "../../../../../src/server/composition/clientes";
import { CLIENTE_HARD_REMOVE_ROLES, CLIENTE_WRITE_ROLES } from "../../../../../src/lib/domain/clients/cliente";
import { toClienteActor } from "../../../../../src/server/use-cases/clientes";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, message: NEXT_IMPLEMENTATION_MESSAGE } },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  if (id.trim() === "") {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const apiContext = resolveGestionApiContext(cookieValue);
  if (!apiContext.ok) {
    return NextResponse.json({ ok: false, error: apiContext.error }, { status: getHttpStatus(apiContext.error.code) });
  }
  const repository = createRemoteClienteRepository(apiContext.value);
  const found = await repository.getById(toClienteActor(session.value), id);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: getHttpStatus(found.error.code) });
  }
  return NextResponse.json({ ok: true, data: found.value }, {
    status: 200,
    headers: { ETag: `W/"v${found.value.version}"` }
  });
}

async function handleUpdate(request: NextRequest, id: string): Promise<NextResponse> {
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  if (!CLIENTE_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  void id;
  void cookieValue;
  return nextImplementationResponse();
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
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  if (!CLIENTE_HARD_REMOVE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  void id;
  void cookieValue;
  return nextImplementationResponse();
}
