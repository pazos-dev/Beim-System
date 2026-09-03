/**
 * Money parsing/helper utilities for the persistence boundary.
 *
 * `parseBeimMoney` replicates the legacy `parse_beim_money` SQL function used on
 * `beim_receipts.price` text columns. It strips non-numeric characters, treats
 * dots as thousands separators and commas as the decimal separator, and coalesces
 * empty/absent input to 0.
 */

export interface DecimalLike {
  toNumber(): number
}

export type DecimalInput = DecimalLike | number | null | undefined

/**
 * Convert a Prisma `Decimal` (or plain number / null) to a `number`.
 */
export function decimalToNumber(value: DecimalInput): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return value.toNumber()
}

/**
 * Parse a legacy text money value into a number.
 * - Strips every character that is not a digit, comma, dot, or hyphen.
 * - Treats dot as a thousands separator (removed) and comma as the decimal
 *   separator (converted to `.`), replicating the common stored price format.
 * - Returns 0 for empty/null/absent input or unparseable values.
 */
export function parseBeimMoney(value: string | null | undefined): number {
  const cleaned = String(value ?? '').replace(/[^0-9,.-]/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.replace(/\./g, '').replace(/,/g, '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
