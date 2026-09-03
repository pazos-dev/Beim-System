/**
 * Stock transfer helpers — pure functions for validating transfer sources
 * and generating paired web↔workshop transfer movements. Ported from legacy
 * `/api/gestion/stock-transfers/web-to-workshop` logic in
 * pagina-web/server.js.
 *
 * All functions are pure: inputs are never mutated and `now` is injected
 * when a timestamp is needed (never `new Date()` inside pure functions).
 */

import { DomainError, ErrorCodes } from '../domain-error'
import type { StockMovementInput } from './movement'

/** Source product types that identify a workshop product (not transferable). */
const WORKSHOP_PRODUCT_TYPES = [
  'repuesto',
  'servicio',
  'taller',
  'insumo',
  'herramienta',
] as const

/** Shape that supports productType lookup. */
export interface TransferSourceProduct {
  productType?: string
}

/**
 * Rejects transfers from products whose `productType` is one of the workshop
 * types (`repuesto`, `servicio`, `taller`, `insumo`, `herramienta`). Throws
 * `DomainError` with `INVALID_TRANSFER_SOURCE`.
 */
export function validateTransferSource(product: TransferSourceProduct): void {
  const productType = String(product.productType ?? '').trim().toLowerCase()
  if ((WORKSHOP_PRODUCT_TYPES as readonly string[]).includes(productType)) {
    throw new DomainError(
      ErrorCodes.INVALID_TRANSFER_SOURCE,
      'El producto seleccionado ya pertenece al taller.',
    )
  }
}

/**
 * Derives the destination product id for a web→workshop transfer as
 * `workshop-web-{sourceId}`.
 */
export function deriveDestinationId(sourceId: string): string {
  return `workshop-web-${sourceId}`
}

/**
 * Generates two paired stock movements for a web→workshop transfer:
 * `web_transfer_out` with a negative quantity on the source, and
 * `web_transfer_in` with a positive quantity on the destination. Both
 * movements share the same `referenceType` and `referenceId`.
 */
export function generatePairedTransferMovements(
  sourceId: string,
  quantity: number,
  now?: string,
): [StockMovementInput, StockMovementInput] {
  const destinationId = deriveDestinationId(sourceId)
  // Transfer reference is stable for both sides. The injected `now` (when
  // provided) makes the reference deterministic for a given call yet unique
  // across calls; otherwise it falls back to a pure source+quantity key.
  const referenceId = now
    ? `transfer-${now.replace(/[^0-9a-z]/gi, '').slice(0, 20)}`
    : `transfer-${sourceId}-${quantity}`

  const out: StockMovementInput = {
    productId: sourceId,
    movementType: 'web_transfer_out',
    quantity: -Number(quantity),
    balanceAfter: 0,
    referenceType: 'stock_transfer',
    referenceId,
    detail: `Salida hacia taller`,
  }

  const inbound: StockMovementInput = {
    productId: destinationId,
    movementType: 'web_transfer_in',
    quantity: Number(quantity),
    balanceAfter: 0,
    referenceType: 'stock_transfer',
    referenceId,
    detail: 'Ingreso desde web',
  }

  return [out, inbound]
}
