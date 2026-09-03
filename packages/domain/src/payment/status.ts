/**
 * Payment status helpers — pure functions for normalizing payment status,
 * guarding stock commitment on payment transitions, and computing stock
 * deductions. Ported from legacy normalizeGestionPaymentStatus and
 * updateOrderPaymentStatus in pagina-web/server.js.
 *
 * Payment vocabularies are kept SEPARATE: gestion uses
 * `Sin abonar | Seña | Pagado`, while the web uses `Pendiente de pago |
 * Parcial | Pagado`. `mapWebPaymentStatus` translates web → gestion at the
 * boundary; `normalizePaymentStatus` works on the gestion vocabulary.
 */

import { DomainError, ErrorCodes } from '../domain-error'

/** Gestion payment status vocabulary. */
export type GestionPaymentStatus = 'Sin abonar' | 'Seña' | 'Pagado'

/**
 * Normalizes a raw status into the gestion payment vocabulary:
 * `Pagado` → `Pagado`, `Seña|Sena|Parcial` → `Seña`, default → `Sin abonar`.
 */
export function normalizePaymentStatus(status: string): GestionPaymentStatus {
  const value = String(status ?? '').trim()
  if (value === 'Pagado') return 'Pagado'
  if (value === 'Seña' || value === 'Sena' || value === 'Parcial') return 'Seña'
  return 'Sin abonar'
}

/**
 * Guards against reverting a `Pagado` payment once stock has been committed.
 * Throws `DomainError` with `STOCK_COMMITTED` when reverting a paid status
 * while `stockCommitted` is `true`.
 *
 * @param currentStatus the current payment status (gestion vocabulary)
 * @param targetStatus the target payment status being requested
 * @param stockCommitted whether stock has already been deducted
 */
export function validateStockCommitmentGuard(
  currentStatus: string,
  targetStatus: string,
  stockCommitted: boolean,
): void {
  if (currentStatus === 'Pagado' && stockCommitted && targetStatus !== 'Pagado') {
    throw new DomainError(
      ErrorCodes.STOCK_COMMITTED,
      'El pago ya fue confirmado y el stock fue descontado. No puede revertirse desde esta pantalla.',
    )
  }
}

export interface StockDeductionItem {
  productId: string
  quantity: number
}

/**
 * Returns the list of stock deductions (productId + quantity) for order
 * items, skipping items with empty productId or non-positive quantity.
 */
export function computeStockDeductions(
  items: ReadonlyArray<{
    productId?: string
    quantity?: number
  }>,
): StockDeductionItem[] {
  const deductions: StockDeductionItem[] = []
  for (const item of items) {
    const productId = String(item.productId ?? '').trim()
    const quantity = Number(item.quantity ?? 0)
    if (!productId || quantity <= 0) continue
    deductions.push({ productId, quantity })
  }
  return deductions
}

/**
 * Maps a payment status from the web vocabulary (`Pendiente de pago |
 * Parcial | Pagado`) to the gestion vocabulary (`Sin abonar | Seña |
 * Pagado`) at the boundary. Web and gestion vocabularies are kept separate;
 * this translation happens only when crossing the boundary.
 */
export function mapWebPaymentStatus(status: string): GestionPaymentStatus {
  const value = String(status ?? '').trim()
  if (value === 'Pagado') return 'Pagado'
  if (value === 'Parcial' || value === 'Seña' || value === 'Sena') return 'Seña'
  return 'Sin abonar'
}
