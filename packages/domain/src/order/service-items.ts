/**
 * Service item normalization and stock helpers — pure functions for service
 * items on receipts. Ported from legacy normalizeGestionServiceItems,
 * commitGestionOrderItemStock, and restoreRemovedServiceItemStockLocally in
 * pagina-web/server.js. All functions are pure: they accept state and return
 * new state without mutating their inputs.
 */

/** The canonical approval status vocabulary used by the domain. */
export type ApprovalStatus = 'Aprobado' | 'No aprobado' | 'Pendiente'

/** Raw shape accepted by normalizeServiceItems before normalization. */
export interface RawServiceItem {
  description?: string
  name?: string
  service?: string
  price?: number | string
  amount?: number | string
  total?: number | string
  quantity?: number | string
  approvalStatus?: string
  status?: string
  source?: string
  productId?: string
  stockDeducted?: boolean
  stockDeductedAt?: string
}

/** Normalized service item shape. */
export interface NormalizedServiceItem {
  description: string
  price: number
  quantity: number
  approvalStatus: string
  source: 'initial' | 'added'
  productId: string
  stockDeducted: boolean
  stockDeductedAt: string
}

/**
 * Maps a raw approval status to the canonical vocabulary:
 * `aprobado|aprobada` → `Aprobado`, `no aprobado|rechazado|rechazada` →
 * `No aprobado`, default → `Pendiente`. Case-insensitive.
 */
export function normalizeServiceItemApprovalStatus(status?: string): string {
  const value = String(status ?? '').trim().toLowerCase()
  if (value === 'aprobado' || value === 'aprobada') return 'Aprobado'
  if (value === 'no aprobado' || value === 'rechazado' || value === 'rechazada') {
    return 'No aprobado'
  }
  return 'Pendiente'
}

/**
 * Normalizes a list of raw service items: filters out `source:"initial"`
 * items, coerces numeric fields, maps approval status, and fills defaults.
 * Returns an empty array for non-array input.
 */
export function normalizeServiceItems(
  items: readonly RawServiceItem[] | null | undefined,
): NormalizedServiceItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((item): item is RawServiceItem => Boolean(item))
    .map((item) => {
      const price = Number(item.price ?? item.amount ?? item.total ?? 0)
      const quantity = Math.max(1, Number(item.quantity ?? 1))
      const source: 'initial' | 'added' =
        item.source === 'initial' ? 'initial' : 'added'
      return {
        description: String(item.description ?? item.name ?? item.service ?? '').trim(),
        price: Number.isFinite(price) && price > 0 ? price : 0,
        quantity: Number.isFinite(quantity) ? quantity : 1,
        approvalStatus: normalizeServiceItemApprovalStatus(
          item.approvalStatus ?? item.status,
        ),
        source,
        productId: String(item.productId ?? ''),
        stockDeducted: Boolean(item.stockDeducted),
        stockDeductedAt: String(item.stockDeductedAt ?? ''),
      }
    })
    .filter((item) => item.source !== 'initial')
    .filter((item) => item.description !== '' || item.price > 0)
}

/**
 * Returns the list of descriptions that appear more than once in the items,
 * preserving occurrence order.
 */
export function findDuplicateServiceItemDescriptions(
  items: ReadonlyArray<{ description: string }>,
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const item of items) {
    if (seen.has(item.description)) {
      duplicates.add(item.description)
    }
    seen.add(item.description)
  }
  return [...duplicates]
}

/**
 * Returns a NEW stock map where stock for each approved, not-yet-deducted,
 * product-linked item is decreased by `quantity`. Inputs are never mutated.
 */
export function commitApprovedServiceItemStockLocally(
  stockMap: Map<string, number>,
  items: ReadonlyArray<{
    productId?: string
    quantity?: number
    approvalStatus?: string
    stockDeducted?: boolean
  }>,
): Map<string, number> {
  const next = new Map(stockMap)
  for (const item of items) {
    if (item.stockDeducted) continue
    if (item.approvalStatus === 'No aprobado') continue
    if (item.approvalStatus !== 'Aprobado') continue
    const productId = String(item.productId ?? '').trim()
    const quantity = Number(item.quantity ?? 0)
    if (!productId || quantity <= 0) continue
    const current = next.get(productId) ?? 0
    next.set(productId, current - quantity)
  }
  return next
}

/**
 * Returns a NEW stock map where stock for each valid product-linked item
 * (non-empty productId, positive quantity) is increased by `quantity`.
 * Inputs are never mutated.
 */
export function restoreRemovedServiceItemStockLocally(
  stockMap: Map<string, number>,
  items: ReadonlyArray<{
    productId?: string
    quantity?: number
  }>,
): Map<string, number> {
  const next = new Map(stockMap)
  for (const item of items) {
    const productId = String(item.productId ?? '').trim()
    const quantity = Number(item.quantity ?? 0)
    if (!productId || quantity <= 0) continue
    const current = next.get(productId) ?? 0
    next.set(productId, current + quantity)
  }
  return next
}
