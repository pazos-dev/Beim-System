/**
 * Purchase stock helpers — pure functions for weighted average cost (WAC)
 * computation, purchase validation, and purchase annulment stock guard.
 * Ported from legacy purchase creation and annulment logic in
 * pagina-web/server.js.
 */

import { DomainError, ErrorCodes } from '../domain-error'

/**
 * Computes the weighted average cost:
 * `((oldStock × oldCost) + (newQty × newCost)) / (oldStock + newQty)`.
 * When the combined stock equals zero, returns `newCost`.
 */
export function computeWeightedAverageCost(
  oldStock: number,
  oldCost: number,
  newQty: number,
  newCost: number,
): number {
  const combined = Number(oldStock) + Number(newQty)
  if (combined === 0) return Number(newCost)
  return (Number(oldStock) * Number(oldCost) + Number(newQty) * Number(newCost)) / combined
}

/** Shape of a purchase record to validate. */
export interface PurchaseInput {
  productId?: string
  quantity?: number
  unitCost?: number
  categoryId?: string
  brand?: string
  model?: string
}

/**
 * Validates a purchase record: requires `productId`, positive integer
 * `quantity`, non-negative `unitCost`, and non-empty `categoryId`, `brand`,
 * `model`. Throws `DomainError` with `INVALID_PURCHASE` on any violation.
 */
export function validatePurchase(purchase: PurchaseInput): void {
  const productId = String(purchase.productId ?? '').trim()
  const quantity = Number(purchase.quantity ?? 0)
  const unitCost = Number(purchase.unitCost ?? 0)
  const categoryId = String(purchase.categoryId ?? '').trim()
  const brand = String(purchase.brand ?? '').trim()
  const model = String(purchase.model ?? '').trim()

  if (
    !productId ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(unitCost) ||
    unitCost < 0 ||
    !categoryId ||
    !brand ||
    !model
  ) {
    throw new DomainError(
      ErrorCodes.INVALID_PURCHASE,
      'La compra no tiene datos suficientes o contiene valores inválidos.',
    )
  }
}

/**
 * Guards purchase annulment: rejects when `currentStock` is less than the
 * `purchaseQuantity` to reverse. Throws `DomainError` with
 * `INSUFFICIENT_STOCK`.
 */
export function validatePurchaseAnnulment(
  currentStock: number,
  purchaseQuantity: number,
): void {
  if (Number(currentStock) < Number(purchaseQuantity)) {
    throw new DomainError(
      ErrorCodes.INSUFFICIENT_STOCK,
      'No se puede anular: el stock actual es menor que la cantidad de esta compra.',
    )
  }
}
