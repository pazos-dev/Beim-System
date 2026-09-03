import { describe, it, expect } from 'vitest'
import { formatPrice, formatStockStatus } from './format'

describe('formatPrice', () => {
  it('formats UYU price with $ symbol and thousands separator', () => {
    expect(formatPrice(1599, 'UYU')).toBe('$1.599')
  })

  it('formats USD price with US$ symbol', () => {
    expect(formatPrice(49.99, 'USD')).toBe('US$49,99')
  })

  it('formats price with decimal cents for UYU', () => {
    expect(formatPrice(1500.5, 'UYU')).toBe('$1.500,5')
  })

  it('formats zero price', () => {
    expect(formatPrice(0, 'UYU')).toBe('$0')
  })

  it('defaults to UYU when currency is not provided', () => {
    expect(formatPrice(250)).toBe('$250')
  })

  it('formats large price with proper grouping', () => {
    expect(formatPrice(1234567, 'UYU')).toBe('$1.234.567')
  })
})

describe('formatStockStatus', () => {
  it('returns out-of-stock message when stock is zero', () => {
    expect(formatStockStatus(0)).toBe('Sin stock')
  })

  it('returns low stock message when stock is 1', () => {
    expect(formatStockStatus(1)).toBe('Últimas unidades')
  })

  it('returns low stock message when stock is 3', () => {
    expect(formatStockStatus(3)).toBe('Últimas unidades')
  })

  it('returns in-stock message when stock is 5', () => {
    expect(formatStockStatus(5)).toBe('En stock')
  })

  it('returns in-stock message for large stock', () => {
    expect(formatStockStatus(100)).toBe('En stock')
  })

  it('returns out-of-stock message for negative stock', () => {
    expect(formatStockStatus(-1)).toBe('Sin stock')
  })
})
