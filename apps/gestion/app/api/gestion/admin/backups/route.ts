// Admin backups list + trigger. Thin delegates to AdminUseCases.
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminUseCases } from "../../../../../src/server/composition/admin";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { toAdminActor } from "../../../../../src/server/use-cases/admin";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const listed = await createAdminUseCases(dataDirectory()).listBackups(toAdminActor(session.value));
  if (!listed.ok) return NextResponse.json({ ok: false, error: listed.error }, { status: getHttpStatus(listed.error.code) });
  return NextResponse.json({ ok: true, data: { backups: listed.value } }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const created = await createAdminUseCases(dataDirectory()).triggerBackup(toAdminActor(session.value));
  if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: getHttpStatus(created.error.code) });
  return NextResponse.json({ ok: true, data: { backup: created.value } }, { status: 201 });
}
