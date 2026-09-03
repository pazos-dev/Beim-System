/**
 * Payment annulment helpers — pure functions for validating annulment
 * reasons, detecting duplicate annulments, and computing stock restorations.
 * Ported from legacy sale annulment logic in pagina-web/server.js.
 *
 * All functions are pure: `now` is injected (never `new Date()` inside
 * pure functions) and results are returned without mutating inputs.
 */

import { DomainError, ErrorCodes } from '../domain-error'

export interface AnnulmentReceipt {
  stockRestoredAt?: string
  financialReversedAt?: string
  [key: string]: unknown
}

export interface AnnulmentItem {
  productId?: string
  quantity?: number
}

export interface StockRestoration {
  productId: string
  quantity: number
}

export interface AnnulmentResult {
  duplicate: boolean
  stockRestorations: StockRestoration[]
  financialReversal: boolean
  annulledAt: string
  stockRestoredAt: string
  financialReversedAt: string
}

/**
 * Rejects an empty or whitespace-only annulment reason with
 * `ANNULMENT_REASON_REQUIRED`.
 */
export function validateAnnulmentReason(reason: string): void {
  if (!String(reason ?? '').trim()) {
    throw new DomainError(
      ErrorCodes.ANNULMENT_REASON_REQUIRED,
      'Debes escribir el motivo de la anulación.',
    )
  }
}

/**
 * Returns `{ duplicate: true }` when both `stockRestoredAt` and
 * `financialReversedAt` are set on the receipt, indicating the annulment was
 * already fully processed.
 */
export function checkDuplicateAnnulment(receipt: AnnulmentReceipt): {
  duplicate: boolean
} {
  const duplicate =
    Boolean(receipt.stockRestoredAt) && Boolean(receipt.financialReversedAt)
  return { duplicate }
}

/**
 * Processes a payment annulment. On duplicate (`stockRestoredAt` +
 * `financialReversedAt` both set) returns `duplicate: true` with no stock
 * restorations. On first processing, returns the stock restorations for each
 * valid item (non-empty productId, positive quantity) plus financial
 * reversal. `now` is injected to keep the function pure.
 */
export function processAnnulment(
  receipt: AnnulmentReceipt,
  items: ReadonlyArray<AnnulmentItem>,
  now?: string,
): AnnulmentResult {
  const timestamp = now ?? ''
  const { duplicate } = checkDuplicateAnnulment(receipt)

  if (duplicate) {
    return {
      duplicate: true,
      stockRestorations: [],
      financialReversal: false,
      annulledAt: timestamp,
      stockRestoredAt: timestamp,
      financialReversedAt: timestamp,
    }
  }

  const stockRestorations: StockRestoration[] = []
  for (const item of items) {
    const productId = String(item.productId ?? '').trim()
    const quantity = Number(item.quantity ?? 0)
    if (!productId || quantity <= 0) continue
    stockRestorations.push({ productId, quantity })
  }

  return {
    duplicate: false,
    stockRestorations,
    financialReversal: true,
    annulledAt: timestamp,
    stockRestoredAt: timestamp,
    financialReversedAt: timestamp,
  }
}
