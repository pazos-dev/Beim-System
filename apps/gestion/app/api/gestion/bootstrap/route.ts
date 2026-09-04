import { join } from "node:path";

import { NextResponse, type NextRequest } from "next/server";

import { JsonStore } from "../../../../src/server/data/json-store.js";
import {
  auditDocumentSchema,
  categoriasDocumentSchema,
  clientesDocumentSchema,
  comprasDocumentSchema,
  gastosDocumentSchema,
  movimientosStockDocumentSchema,
  ordenesDocumentSchema,
  productosDocumentSchema,
  serviciosDocumentSchema,
  sesionesCajaDocumentSchema,
  ventasDocumentSchema,
  type AuditEvent,
  type Categoria,
  type Cliente,
  type Compra,
  type Gasto,
  type MovimientoStock,
  type Orden,
  type Producto,
  type Servicio,
  type SesionCaja,
  type Venta
} from "../../../../src/server/data/schemas.js";
import { AuthService, usersDocumentSchema, type AuthActor, type UserDocument } from "../../../../src/server/handlers/auth.js";
import { buildErrorEnvelope, ERROR_CODES, getHttpStatus } from "../../../../src/server/handlers/errors.js";
import { SESSION_COOKIE_NAME } from "../../../../src/server/handlers/session.js";

type PublicUser = Pick<UserDocument["users"][number], "id" | "username" | "displayName" | "role" | "active">;

interface BootstrapPayload {
  clientes: Cliente[];
  categorias: Categoria[];
  productos: Producto[];
  servicios: Servicio[];
  ordenes: Orden[];
  ventas: Venta[];
  compras: Compra[];
  movimientosStock: MovimientoStock[];
  sesionesCaja: SesionCaja[];
  gastos: Gasto[];
  users: PublicUser[];
  audit: AuditEvent[];
  meta: { version: number };
}

const BOOTSTRAP_VERSION = 1;

function visibleTo<T extends { ownerId: string }>(items: T[], actor: AuthActor): T[] {
  if (actor.role === "administrador" || actor.role === "administrador_principal") return items;
  return items.filter((item) => item.ownerId === actor.id);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const service = new AuthService();
  const session = await service.session(cookieValue);
  if (!session.ok) {
    return NextResponse.json({ ok: false, error: session.error }, { status: getHttpStatus(session.error.code) });
  }
  const actor = session.value;
  const dataDirectory = process.env.GESTION_DATA_DIR ?? join(process.cwd(), "data");

  const [clientes, categorias, productos, servicios, ordenes, ventas] = await Promise.all([
    new JsonStore(join(dataDirectory, "clientes.json"), clientesDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "categorias.json"), categoriasDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "productos.json"), productosDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "servicios.json"), serviciosDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "ordenes.json"), ordenesDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "ventas.json"), ventasDocumentSchema).read()
  ]);
  const [compras, movimientos, caja, gastos, users, audit] = await Promise.all([
    new JsonStore(join(dataDirectory, "compras.json"), comprasDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "movimientos-stock.json"), movimientosStockDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "sesiones-caja.json"), sesionesCajaDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "gastos.json"), gastosDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "users.json"), usersDocumentSchema).read(),
    new JsonStore(join(dataDirectory, "audit.json"), auditDocumentSchema).read()
  ]);

  // Fallo cerrado: cualquier owner ilegible o inválido anula todo el bootstrap; nunca se devuelven parciales.
  if (!clientes.ok || !categorias.ok || !productos.ok || !servicios.ok || !ordenes.ok || !ventas.ok || !compras.ok || !movimientos.ok || !caja.ok || !gastos.ok || !users.ok || !audit.ok) {
    const error = buildErrorEnvelope(ERROR_CODES.STORAGE_ERROR);
    return NextResponse.json(error, { status: getHttpStatus(error.error.code) });
  }

  const payload: BootstrapPayload = {
    clientes: visibleTo(clientes.value.clientes, actor),
    categorias: visibleTo(categorias.value.categorias, actor),
    productos: visibleTo(productos.value.productos, actor),
    servicios: visibleTo(servicios.value.servicios, actor),
    ordenes: visibleTo(ordenes.value.ordenes, actor),
    ventas: visibleTo(ventas.value.ventas, actor),
    compras: visibleTo(compras.value.compras, actor),
    movimientosStock: visibleTo(movimientos.value.movimientosStock, actor),
    sesionesCaja: visibleTo(caja.value.sesionesCaja, actor),
    gastos: visibleTo(gastos.value.gastos, actor),
    users: users.value.users.map((user) => ({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, active: user.active })),
    audit: audit.value.events,
    meta: { version: BOOTSTRAP_VERSION }
  };
  return NextResponse.json({ ok: true, data: payload }, { status: 200 });
}
