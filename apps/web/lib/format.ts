import type { Currency } from '@beim/contracts'

/**
 * Format a price number into a locale-aware currency string.
 * Uses Argentine/UYU formatting conventions (dot thousands, comma decimals).
 */
export function formatPrice(price: number, currency?: Currency): string {
  const curr = currency ?? 'UYU'

  const formatted = price.toLocaleString('es-UY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })

  if (curr === 'USD') {
    return `US$${formatted}`
  }

  return `$${formatted}`
}

/**
 * Return a human-readable stock status label.
 */
export function formatStockStatus(stock: number): string {
  if (stock <= 0) return 'Sin stock'
  if (stock <= 3) return 'Últimas unidades'
  return 'En stock'
}
