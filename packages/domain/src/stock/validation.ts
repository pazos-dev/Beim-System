/**
 * Stock validation helpers — pure functions for checking stock sufficiency
 * and minimum stock thresholds. Ported from legacy stock guard logic in
 * pagina-web/server.js (e.g. `stock >= $2` conditions and min stock checks).
 */

import { DomainError, ErrorCodes } from '../domain-error'

/**
 * Rejects a stock deduction when `stock` is less than `requested`.
 * Throws `DomainError` with `INSUFFICIENT_STOCK`.
 */
export function validateStockSufficiency(stock: number, requested: number): void {
  if (Number(stock) < Number(requested)) {
    throw new DomainError(
      ErrorCodes.INSUFFICIENT_STOCK,
      'No hay stock suficiente para realizar la operación.',
    )
  }
}

/**
 * Returns `{ belowMin: true }` when `stock` is below `minStock`, or when no
 * `minStock` is configured. Equal values are NOT flagged.
 */
export function checkMinStockThreshold(
  stock: number,
  minStock?: number,
): { belowMin: boolean } {
  if (minStock === undefined || minStock === null) return { belowMin: false }
  return { belowMin: Number(stock) < Number(minStock) }
}
