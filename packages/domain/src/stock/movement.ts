/**
 * Stock movement computation helpers — pure functions for computing balance
 * after a movement and constructing typed stock movement records. Ported
 * from legacy insertGestionStockMovement calls in pagina-web/server.js.
 *
 * Movement records exclude the DB-assigned `id` and `createdAt` fields;
 * those are added by the persistence layer at write time.
 */

import type { StockMovementType } from '@beim/contracts'

/**
 * Computes `balanceAfter` as the previous balance plus the signed quantity.
 * Positive quantity (purchase) increases stock; negative (sale) decreases it.
 */
export function computeBalanceAfter(
  previousBalance: number,
  quantity: number,
): number {
  return Number(previousBalance) + Number(quantity)
}

/** Input to `createStockMovement` — movement fields without DB identity. */
export interface StockMovementInput {
  productId: string
  movementType: StockMovementType
  quantity: number
  balanceAfter: number
  referenceType?: string
  referenceId?: string
  detail?: string
}

/**
 * Returns a typed stock movement record from the given parameters. This is
 * a pure constructor — it only assembles the shape from its inputs.
 */
export function createStockMovement(
  params: StockMovementInput,
): StockMovementInput {
  return {
    productId: params.productId,
    movementType: params.movementType,
    quantity: params.quantity,
    balanceAfter: params.balanceAfter,
    ...(params.referenceType !== undefined
      ? { referenceType: params.referenceType }
      : {}),
    ...(params.referenceId !== undefined
      ? { referenceId: params.referenceId }
      : {}),
    ...(params.detail !== undefined ? { detail: params.detail } : {}),
  }
}
