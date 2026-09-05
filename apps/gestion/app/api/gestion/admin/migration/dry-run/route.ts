import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireMenuAdmin } from "../../../../../../src/lib/domain/admin/menu.js";
import { AuthService } from "../../../../../../src/server/handlers/auth.js";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../../src/server/handlers/errors.js";
import { SESSION_COOKIE_NAME } from "../../../../../../src/server/handlers/session.js";
import { dryRun, migrationStateSchema } from "../../../../../../src/server/migration/migration.js";

const CUTOVER_BLOCKED_MESSAGE = "cutover bloqueado por spec";
const bodySchema = z.object({ legacyDump: z.record(z.string(), z.unknown()).optional() });
function dataDirectory(): string {
  return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");
}
function cutoverBlocked(): NextResponse {
  const error = createGestionError(ERROR_CODES.FORBIDDEN, undefined, CUTOVER_BLOCKED_MESSAGE);
  return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
}
export async function POST(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text.length === 0 ? {} : (JSON.parse(text) as unknown);
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  // Decision: body vacio usa el fixture sintetico versionado como entrada por defecto.
  let legacyDump = parsed.data.legacyDump;
  if (legacyDump === undefined) {
    try {
      legacyDump = JSON.parse(await readFile(join(process.cwd(), "fixtures", "legacy-sample.json"), "utf8")) as Record<string, unknown>;
    } catch {
      const error = createGestionError(ERROR_CODES.STORAGE_ERROR);
      return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
    }
  }
  // El dry-run lee migration-state.json solo para reportar estado; nunca lo escribe ni lo muta.
  let estado = "bloqueado";
  try {
    estado = migrationStateSchema.parse(JSON.parse(await readFile(join(dataDirectory(), "migration-state.json"), "utf8")) as unknown).estado;
  } catch {
    estado = "bloqueado";
  }
  const plan = dryRun(legacyDump, estado);
  if (plan.bloqueos.length > 0) {
    const error = createGestionError(ERROR_CODES.CONFLICT, { keys: plan.bloqueos.map((b) => b.legacyKey) }, "Migration blocked: secret detected.");
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  return NextResponse.json({ ok: true, data: plan }, { status: 200 });
}
export function GET(): NextResponse {
  return cutoverBlocked();
}
export function PUT(): NextResponse {
  return cutoverBlocked();
}
export function PATCH(): NextResponse {
  return cutoverBlocked();
}
export function DELETE(): NextResponse {
  return cutoverBlocked();
}
