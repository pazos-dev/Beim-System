import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { createRemoteClienteRepository } from "../../../../src/server/composition/clientes";
import { CLIENTE_WRITE_ROLES, clienteMatchesQuery } from "../../../../src/lib/domain/clients/cliente";
import {
  clienteListQuerySchema,
  toClienteActor,
  type ClienteListItem,
  type ClienteListResponse
} from "../../../../src/server/use-cases/clientes";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../src/server/api/gestion-api-context";
import type { Cliente } from "../../../../src/server/data/schemas";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function toClienteListItem(cliente: Cliente): ClienteListItem {
  return {
    active: cliente.active,
    displayName: cliente.displayName,
    document: cliente.document,
    email: cliente.email,
    id: cliente.id,
    phone: cliente.phone,
    version: cliente.version
  };
}

function applyClienteListQuery(clientes: Cliente[], query: ReturnType<typeof clienteListQuerySchema.parse>): ClienteListResponse {
  const filtered = clientes.filter((cliente) => {
    if (query.active === "true" && !cliente.active) return false;
    if (query.active === "false" && cliente.active) return false;
    if (query.q !== undefined && !clienteMatchesQuery(cliente, query.q)) return false;
    return true;
  });
  const totalItems = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize).map(toClienteListItem);
  return { items, page: query.page, pageSize: query.pageSize, totalItems };
}

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, message: NEXT_IMPLEMENTATION_MESSAGE } },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const parsed = clienteListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const context = resolveGestionApiContext(cookieValue);
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: getHttpStatus(context.error.code) });
  }
  const repository = createRemoteClienteRepository(context.value);
  const listed = await repository.list(toClienteActor(session.value));
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: getHttpStatus(listed.error.code) });
  }
  const response = applyClienteListQuery(listed.value, parsed.data);
  return NextResponse.json({ ok: true, data: response }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  void request;
  return nextImplementationResponse();
}
