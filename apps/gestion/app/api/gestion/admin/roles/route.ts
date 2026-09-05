import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getHttpStatus } from "../../../../../src/server/handlers/errors";
import { AuthService, rolePermissionsDocumentSchema } from "../../../../../src/server/handlers/auth";
import { JsonStore } from "../../../../../src/server/data/json-store";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";
import { requireMenuAdmin } from "../../../../../src/lib/domain/admin/menu";

function dataDirectory(): string { return process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data"); }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const service = new AuthService(dataDirectory());
  const session = await service.session(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!session.ok) return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  const allowed = requireMenuAdmin(session.value);
  if (!allowed.ok) return NextResponse.json({ ok: false, error: allowed.error }, { status: getHttpStatus(allowed.error.code) });
  const store = new JsonStore(join(dataDirectory(), "role-permissions.json"), rolePermissionsDocumentSchema);
  const loaded = await store.read();
  if (!loaded.ok) return NextResponse.json({ ok: false, error: { code: "STORAGE_ERROR", message: "No se pudo acceder al almacenamiento." } }, { status: 500 });
  const actorActions = new Set(loaded.value.permissions[session.value.role] ?? []);
  const roles = Object.entries(loaded.value.permissions).map(([role, actions]) => ({
    role,
    actions,
    actorHas: actions.map((action) => actorActions.has(action))
  }));
  return NextResponse.json({ ok: true, data: { actorRole: session.value.role, roles } }, { status: 200 });
}
