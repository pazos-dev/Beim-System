/**
 * Order calculation helpers — pure functions for computing service-item
 * totals and technical base budgets. Ported from legacy `serviceItemsTotal`
 * and `technicalBaseBudget` in pagina-web/server.js.
 */

/** A minimal service item shape used for monetary calculations. */
export interface PriceableServiceItem {
  price: number
}

/**
 * Sums the `price` of every service item. Empty input yields `0`.
 */
export function serviceItemsTotal(items: readonly PriceableServiceItem[]): number {
  return items.reduce((sum, item) => sum + Number(item.price || 0), 0)
}

/**
 * Computes the technical base budget as `max(budget - addedTotal, 0)`,
 * where `addedTotal` is the sum of the (already normalized) added items.
 * Floors the result at zero so a negative base budget is never returned.
 */
export function technicalBaseBudget(
  budget: number,
  items: readonly PriceableServiceItem[],
): number {
  return Math.max(budget - serviceItemsTotal(items), 0)
}
