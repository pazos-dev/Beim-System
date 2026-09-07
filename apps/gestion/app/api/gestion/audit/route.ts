import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireMenuAdmin } from "../../../../src/lib/domain/admin/menu";
import { HttpAuditRepository } from "../../../../src/server/auditoria/http-audit-repository";
import { JsonAuditReadRepository } from "../../../../src/server/auditoria/json-audit-read-repository";
import type {
  AuditReadFilters,
  AuditReadPort
} from "../../../../src/server/auditoria/audit-read-port";
import { AuthService, tokenFromCookie } from "../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session";
import { resolveConsoleApiBaseUrl } from "../../../../src/server/shared/api-console-session";
import { getApiBearer } from "../../../../src/server/shared/session-store";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const auditQuerySchema = z.object({
  actor: z.string().trim().min(1).max(100).optional(),
  action: z.string().trim().min(1).max(100).optional(),
  from: z.string().trim().min(1).max(100).optional(),
  to: z.string().trim().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)
});

function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}

function resolveReader(cookieValue: string | undefined, directory: string): AuditReadPort {
  const sessionToken = cookieValue === undefined ? null : tokenFromCookie(cookieValue);
  const bearer = sessionToken === null ? undefined : getApiBearer(sessionToken);
  if (bearer !== undefined) {
    return new HttpAuditRepository({ baseUrl: resolveConsoleApiBaseUrl(), token: bearer.token });
  }
  return new JsonAuditReadRepository(directory);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const directory = dataDirectory();
  const service = new AuthService(directory);
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  }
  const parsed = auditQuerySchema.safeParse({
    actor: request.nextUrl.searchParams.get("actor") ?? undefined,
    action: request.nextUrl.searchParams.get("action") ?? undefined,
    from: request.nextUrl.searchParams.get("from") ?? undefined,
    to: request.nextUrl.searchParams.get("to") ?? undefined,
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined
  });
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, {
      fields: parsed.error.issues.map((issue) => issue.path.join("."))
    });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const filters: AuditReadFilters = {
    actorId: parsed.data.actor,
    action: parsed.data.action,
    from: parsed.data.from,
    to: parsed.data.to,
    page: parsed.data.page,
    limit: parsed.data.limit
  };
  const result = await resolveReader(cookieValue, directory).list(filters);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: getHttpStatus(result.error.code) });
  }
  return NextResponse.json({ ok: true, data: result.value }, { status: 200 });
}
