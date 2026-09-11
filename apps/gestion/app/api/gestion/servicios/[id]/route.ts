import { join } from "node:path";

import { z } from "zod";
import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { createRemoteServicioRepository } from "../../../../../src/server/composition/servicios";
import { SERVICIO_WRITE_ROLES } from "../../../../../src/lib/domain/services/servicio";
import { toServicioActor, type ServicioVisibility } from "../../../../../src/server/use-cases/servicios";
import {
  NEXT_IMPLEMENTATION_MESSAGE,
  resolveGestionApiContext
} from "../../../../../src/server/api/gestion-api-context";

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

const servicioDetailQuerySchema = z.object({
  active: z.enum(["true", "false", "all"]).default("true")
});

function nextImplementationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: ERROR_CODES.DEPENDENCY_UNAVAILABLE, message: NEXT_IMPLEMENTATION_MESSAGE } },
    { status: getHttpStatus(ERROR_CODES.DEPENDENCY_UNAVAILABLE) }
  );
}

function isVisible(servicio: { active: boolean }, active: ServicioVisibility): boolean {
  if (active === "all") return true;
  if (active === "true") return servicio.active;
  return !servicio.active;
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
  const parsed = servicioDetailQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const apiContext = resolveGestionApiContext(cookieValue);
  if (!apiContext.ok) {
    return NextResponse.json({ ok: false, error: apiContext.error }, { status: getHttpStatus(apiContext.error.code) });
  }
  const repository = createRemoteServicioRepository(apiContext.value);
  const found = await repository.getById(toServicioActor(session.value), id);
  if (!found.ok) {
    return NextResponse.json({ ok: false, error: found.error }, { status: getHttpStatus(found.error.code) });
  }
  if (!isVisible(found.value, parsed.data.active)) {
    const error = createGestionError(ERROR_CODES.NOT_FOUND_OR_FORBIDDEN);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  return NextResponse.json({ ok: true, data: found.value }, {
    status: 200,
    headers: { ETag: `W/"v${found.value.version}"` }
  });
}

export async function PATCH(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
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
  void id;
  void cookieValue;
  return nextImplementationResponse();
}
