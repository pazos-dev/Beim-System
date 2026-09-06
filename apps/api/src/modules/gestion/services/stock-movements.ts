/**
 * Stock-movements service (PR 3).
 *
 * The legacy `gestion_stock_movements` table is NOT part of the vendored
 * 19-table schema — movements are journaled into audit_logs (action
 * 'stock.movement', entity_type 'product', entity_id = product id) with the
 * legacy fields (quantity, movementType, detail) in details.
 *
 * Stock MUTATIONS are NOT performed here: they are owned by StockPort
 * (guardDecrement/restore) inside sales-batch/annul. This endpoint records
 * stock events (purchases in, sales/observations out) and lists them —
 * documented boundary.
 */
import { NotFoundError } from "../../../errors/taxonomy.js";
import type { StockMovementRecord } from "../ports.js";
import { auditLogsRepository } from "../repositories/pg-audit-logs.js";
import { stockRepository } from "../repositories/pg-stock.js";

const ACTION = "stock.movement";
const ENTITY_TYPE = "product";

export const stockMovementsService = {
  /** Journals a movement; 404 when the product does not exist. */
  async record(input: {
    productId: string;
    movementType: string;
    quantity: number;
    detail?: string;
  }): Promise<StockMovementRecord> {
    const prices = await stockRepository.getPricesByIds([input.productId]);
    if (!prices.has(input.productId)) {
      throw new NotFoundError(`Producto no encontrado: ${input.productId}`);
    }

    const audit = await auditLogsRepository.insert({
      action: ACTION,
      entityType: ENTITY_TYPE,
      entityId: input.productId,
      details: {
        quantity: input.quantity,
        movementType: input.movementType,
        detail: input.detail ?? ""
      }
    });
    return mapMovement(audit);
  },

  async list(filter: { productId?: string; from?: string; to?: string }): Promise<StockMovementRecord[]> {
    const rows = await auditLogsRepository.list({
      action: ACTION,
      entityType: ENTITY_TYPE,
      entityId: filter.productId,
      from: filter.from,
      to: filter.to
    });
    return rows.map(mapMovement);
  }
};

function mapMovement(audit: Awaited<ReturnType<typeof auditLogsRepository.insert>>): StockMovementRecord {
  const details = audit.details as { quantity?: number; movementType?: string; detail?: string };
  return {
    id: audit.id,
    productId: audit.entityId ?? "",
    movementType: details.movementType ?? "",
    quantity: details.quantity ?? 0,
    detail: details.detail ?? "",
    createdAt: audit.createdAt
  };
}