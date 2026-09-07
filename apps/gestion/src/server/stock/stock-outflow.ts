import { randomUUID } from "node:crypto";

import { planOutflow, type OutflowInput } from "../../lib/domain/inventory/inventory";
import {
  movimientoStockSchema,
  productoSchema,
  type GestionError,
  type MovimientoStock,
  type Producto
} from "../data/schemas";
import { err, type Result } from "../shared/result";
import {
  createAuditHook,
  reportAuditOutcome,
  toPortActor,
  validationError,
  type StockActor,
  type StockEffectDeps
} from "./stock-port";

export async function outflowEffect(
  deps: StockEffectDeps,
  actor: StockActor,
  data: OutflowInput
): Promise<Result<{ movimiento: MovimientoStock; producto: Producto }, GestionError>> {
  const portActor = toPortActor(actor);
  const found = await deps.port.getProducto(portActor, data.productoId);
  if (!found.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.outflow", null, found);
  const planned = planOutflow(found.value.stock, data, data.ajuste);
  if (!planned.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.outflow", found.value.id, planned);
  const parsedProducto = productoSchema.safeParse({ ...found.value, stock: found.value.stock - data.cantidad });
  if (!parsedProducto.success) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.outflow", found.value.id, err(validationError(parsedProducto.error.issues)));
  }
  const nextProducto: Producto = { ...parsedProducto.data, version: found.value.version + 1 };
  const parsedMovimiento = movimientoStockSchema.safeParse({
    balanceAfter: planned.value.balanceAfter,
    cantidad: planned.value.cantidad,
    deposito: planned.value.deposito,
    id: `m_${randomUUID()}`,
    motivo: planned.value.motivo,
    ownerId: actor.id,
    productoId: found.value.id,
    referencia: data.ajuste ? "ajuste" : undefined,
    version: 1
  });
  if (!parsedMovimiento.success) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.outflow", found.value.id, err(validationError(parsedMovimiento.error.issues)));
  }
  return deps.port.applyOutflow(
    portActor,
    { movimiento: parsedMovimiento.data, producto: nextProducto },
    createAuditHook(deps.audit, actor.id, "stock.outflow", "movimiento-stock", parsedMovimiento.data.id, { productoId: found.value.id })
  );
}
