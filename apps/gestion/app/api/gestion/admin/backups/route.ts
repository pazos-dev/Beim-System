import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { requireMenuAdmin } from "../../../../../src/lib/domain/admin/menu.js";
import { AuthService, type AuthActor } from "../../../../../src/server/handlers/auth.js";
import { getHttpStatus } from "../../../../../src/server/handlers/errors.js";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session.js";
import { createBackup, listBackups } from "../../../../../src/server/backup/backup.js";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

async function adminActor(request: NextRequest): Promise<AuthActor | NextResponse> {
  const session = await new AuthService(dataDirectory()).session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  return allowed.value;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const actor = await adminActor(request);
  if (actor instanceof NextResponse) return actor;
  const listed = await listBackups(dataDirectory());
  if (!listed.ok) return NextResponse.json({ ok: false, error: listed.error }, { status: getHttpStatus(listed.error.code) });
  return NextResponse.json({ ok: true, data: { backups: listed.value } }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const actor = await adminActor(request);
  if (actor instanceof NextResponse) return actor;
  const created = await createBackup(dataDirectory(), actor);
  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: getHttpStatus(created.error.code) });
  return NextResponse.json({ ok: true, data: { backup: created.value } }, { status: 201 });
}
