import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createGestionError, ERROR_CODES, getHttpStatus } from "../../../../../src/server/handlers/errors";
import { AuthService } from "../../../../../src/server/handlers/auth";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { buildMenuTree, createMenuStore, insertMenuNode, loadMenuDocument, requireMenuAdmin } from "../../../../../src/lib/domain/admin/menu";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  const store = createMenuStore(dataDirectory());
  const loaded = await loadMenuDocument(store);
  if (!loaded.ok) return NextResponse.json({ ok: false, error: loaded.error }, { status: getHttpStatus(loaded.error.code) });
  return NextResponse.json({ ok: true, data: { version: loaded.value.version, tree: buildMenuTree(loaded.value.nodes) } }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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
  const inserted = insertMenuNode(loaded.value, body);
  if (!inserted.ok) return NextResponse.json({ ok: false, error: inserted.error }, { status: getHttpStatus(inserted.error.code) });
  const written = await store.write(inserted.value, loaded.value.version);
  if (!written.ok) {
    const error = createGestionError(ERROR_CODES.CONFLICT);
    return NextResponse.json({ ok: false, error }, { status: getHttpStatus(error.code) });
  }
  const node = written.value.nodes[written.value.nodes.length - 1];
  return NextResponse.json({ ok: true, data: { version: written.value.version, node } }, { status: 201 });
}
