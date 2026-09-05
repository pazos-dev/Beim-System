import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "../../../../../src/server/handlers/auth";
import { getHttpStatus } from "../../../../../src/server/handlers/errors";
import { SESSION_COOKIE_NAME } from "../../../../../src/server/handlers/session";

// Mapeo vistas→acciones (data/role-permissions.json): lecturas operativas→*.read; ordenes y boletas→orders.create; clientes→customers.create; productos, compras y servicios→products|purchases|services.create; diagnostico, notas y presupuesto→diagnostics|quotes.manage; stock tecnico→stock.consume; ventas→sales.create; caja y arqueo→cash.manage; reportes→reports.read; respaldos→backups.manage; usuarios no administradores→users.manage; administradores y permisos→admins|permissions.manage (solo administrador_principal).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const service = new AuthService();
  const result = await service.session(cookieValue);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: getHttpStatus(result.error.code) });
  }
  return NextResponse.json({ ok: true, data: result.value }, { status: 200 });
}
