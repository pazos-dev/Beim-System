import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { createRemoteServicioRepository } from "../../../../src/server/composition/servicios";
import { SERVICIO_WRITE_ROLES } from "../../../../src/lib/domain/services/servicio";
import {
  servicioListQuerySchema,
  toServicioActor,
  type ServicioListItem,
  type ServicioListResponse,
  type ServicioVisibility
} from "../../../../src/server/use-cases/servicios";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../src/server/api/gestion-api-context";
import type { Servicio } from "../../../../src/server/data/schemas";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function servicioMatchesQuery(servicio: Servicio, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return true;
  return servicio.displayName.toLowerCase().includes(wanted);
}

function isVisible(servicio: Servicio, active: ServicioVisibility): boolean {
  if (active === "all") return true;
  if (active === "true") return servicio.active;
  return !servicio.active;
}

function toServicioListItem(servicio: Servicio): ServicioListItem {
  return {
    active: servicio.active,
    displayName: servicio.displayName,
    id: servicio.id,
    price: servicio.price,
    version: servicio.version
  };
}

function applyServicioListQuery(servicios: Servicio[], query: ReturnType<typeof servicioListQuerySchema.parse>): ServicioListResponse {
  const filtered = servicios.filter(
    (servicio) => isVisible(servicio, query.active) && (query.q === undefined || servicioMatchesQuery(servicio, query.q))
  );
  const totalItems = filtered.length;
  const start = (query.page - 1) * query.pageSize;
  const items = filtered.slice(start, start + query.pageSize).map(toServicioListItem);
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
  const parsed = servicioListQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const context = resolveGestionApiContext(cookieValue);
  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: getHttpStatus(context.error.code) });
  }
  const repository = createRemoteServicioRepository(context.value);
  const listed = await repository.list(toServicioActor(session.value));
  if (!listed.ok) {
    return NextResponse.json({ ok: false, error: listed.error }, { status: getHttpStatus(listed.error.code) });
  }
  const response = applyServicioListQuery(listed.value, parsed.data);
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
  if (!SERVICIO_WRITE_ROLES.has(session.value.role)) {
    const error = createGestionError(ERROR_CODES.FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  void request;
  return nextImplementationResponse();
}
