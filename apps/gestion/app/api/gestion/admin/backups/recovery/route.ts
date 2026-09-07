// Admin backup restore (guarded by confirm=true). Thin delegate to AdminUseCases.
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminUseCases } from "../../../../../../src/server/composition/admin";
import { AuthService } from "../../../../../../src/server/handlers/auth";
import { getHttpStatus } from "../../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../../src/server/handlers/session";
import { toAdminActor } from "../../../../../../src/server/use-cases/admin";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const restored = await createAdminUseCases(dataDirectory()).restoreBackup(
    toAdminActor(session.value),
    await request.json().catch(() => null)
  );
  if (!restored.ok) return NextResponse.json({ ok: false, error: restored.error }, { status: getHttpStatus(restored.error.code) });
  return NextResponse.json({ ok: true, data: { backup: restored.value } }, { status: 200 });
}
