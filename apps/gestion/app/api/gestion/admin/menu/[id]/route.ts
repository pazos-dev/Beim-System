import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../../src/server/handlers/errors.js";
import { AuthService } from "../../../../../../src/server/handlers/auth.js";
import { SESSION_COOKIE_NAME } from "../../../../../../src/server/handlers/session.js";
import { createMenuStore, loadMenuDocument, moveMenuNode, requireMenuAdmin } from "../../../../../../src/lib/domain/admin/menu.js";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, context: RouteParams): Promise<NextResponse> {
  const { id } = await context.params;
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const error = createGestionError(ERROR_CODES.VALIDATION_ERROR);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const store = createMenuStore(dataDirectory());
  const loaded = await loadMenuDocument(store);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: getHttpStatus(loaded.error.code) });
  const moved = moveMenuNode(loaded.value, id, body);
  if (!moved.ok) return NextResponse.json({ ok: false, error: moved.error }, { status: getHttpStatus(moved.error.code) });
  const written = await store.write(moved.value, loaded.value.version);
  if (!written.ok) {
    const error = createGestionError(ERROR_CODES.CONFLICT);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const node = written.value.nodes.find((candidate) => candidate.id === id);
  return NextResponse.json({ ok: true, data: { version: written.value.version, node } }, { status: 200 });
}
