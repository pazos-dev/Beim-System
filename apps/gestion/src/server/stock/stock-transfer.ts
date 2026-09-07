import { randomUUID } from "node:crypto";

import {
  balanceKey,
  DEPOSITS,
  deriveBalances,
  planTransferPair,
  type TransferInput
} from "../../lib/domain/inventory/inventory";
import {
  movimientoStockSchema,
  type GestionError,
  type MovimientoStock
} from "../data/schemas";
import { createGestionError, ERROR_CODES } from "../shared/errors";
import { err, type Result } from "../shared/result";
import {
  createAuditHook,
  reportAuditOutcome,
  toPortActor,
  validationError,
  type StockActor,
  type StockEffectDeps
} from "./stock-port";

export async function transferEffect(
  deps: StockEffectDeps,
  actor: StockActor,
  data: TransferInput
): Promise<Result<{ movimientos: [MovimientoStock, MovimientoStock] }, GestionError>> {
  const portActor = toPortActor(actor);
  const found = await deps.port.getProducto(portActor, data.productoId);
  if (!found.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.transfer", null, found);
  const movimientos = await deps.port.listMovimientos(portActor, data.productoId);
  if (!movimientos.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.transfer", found.value.id, movimientos);
  const balances = deriveBalances(movimientos.value);
  const principalKey = balanceKey(found.value.id, DEPOSITS.PRINCIPAL);
  if (!movimientos.value.some((move) => balanceKey(move.productoId, move.deposito) === principalKey)) {
    balances.set(principalKey, found.value.stock);
  }
  const pair = planTransferPair(balances, data);
  if (!pair.ok) return reportAuditOutcome(deps.audit, actor.id, "stock.transfer", found.value.id, pair);
  const group = `t_${randomUUID()}`;
  const parsedMoves: MovimientoStock[] = [];
  for (const draft of [
    { ...pair.value.leaving, referencia: group },
    { ...pair.value.arriving, referencia: group }
  ]) {
    const candidate = movimientoStockSchema.safeParse({
      balanceAfter: draft.balanceAfter,
      cantidad: draft.cantidad,
      deposito: draft.deposito,
      id: `m_${randomUUID()}`,
      motivo: "transferencia",
      ownerId: actor.id,
      productoId: found.value.id,
      referencia: draft.referencia,
      version: 1
    });
    if (!candidate.success) {
      return reportAuditOutcome(deps.audit, actor.id, "stock.transfer", found.value.id, err(validationError(candidate.error.issues)));
    }
    parsedMoves.push(candidate.data);
  }
  const [first, second] = parsedMoves;
  if (first === undefined || second === undefined) {
    return reportAuditOutcome(deps.audit, actor.id, "stock.transfer", found.value.id, err(createGestionError(ERROR_CODES.STORAGE_ERROR)));
  }
  return deps.port.applyTransferPair(
    portActor,
    { movimientos: [first, second] },
    createAuditHook(deps.audit, actor.id, "stock.transfer", "movimiento-stock", group, { productoId: found.value.id })
  );
}
