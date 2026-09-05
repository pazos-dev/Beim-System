import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireMenuAdmin } from "../../../../../../src/lib/domain/admin/menu";
import { AuthService, type AuthActor } from "../../../../../../src/server/handlers/auth";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../../src/server/handlers/session";
import { restoreBackup } from "../../../../../../src/server/backup/backup";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

async function adminActor(request: NextRequest): Promise<AuthActor | NextResponse> {
  const session = await new AuthService(dataDirectory()).session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  return allowed.value;
}

function backupIdFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actor = await adminActor(request);
  if (actor instanceof NextResponse) return actor;
  const id = backupIdFromBody(await request.json().catch(() => null));
  if (id === null) {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR, { fields: ["id"] });
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const restored = await restoreBackup(dataDirectory(), actor, id);
  if (!restored.ok) return NextResponse.json({ ok: false, error: restored.error }, { status: getHttpStatus(restored.error.code) });
  return NextResponse.json({ ok: true, data: { backup: restored.value } }, { status: 200 });
}
