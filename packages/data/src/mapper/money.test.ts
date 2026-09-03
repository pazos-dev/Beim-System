import { describe, expect, it } from 'vitest'
import { decimalToNumber, parseBeimMoney } from './money'

describe('parseBeimMoney', () => {
  it('parses the standard thousands-separator format', () => {
    expect(parseBeimMoney('35.600')).toBe(35600)
  })

  it('parses a comma-decimal value with thousands dot', () => {
    expect(parseBeimMoney('1.234,56')).toBe(1234.56)
  })

  it('strips garbage characters and surrounding whitespace/currency', () => {
    expect(parseBeimMoney('$ 35.600 UYU')).toBe(35600)
  })

  it('returns 0 for an empty string', () => {
    expect(parseBeimMoney('')).toBe(0)
  })

  it('returns 0 for null and undefined input', () => {
    expect(parseBeimMoney(null)).toBe(0)
    expect(parseBeimMoney(undefined)).toBe(0)
  })

  it('handles a plain integer text amount', () => {
    expect(parseBeimMoney('25000')).toBe(25000)
  })

  it('handles a text amount with only thousands dots (no decimals)', () => {
    expect(parseBeimMoney('123.456')).toBe(123456)
  })
})

describe('decimalToNumber', () => {
  it('converts a Decimal-like object to a number', () => {
    const decimal = { toNumber: () => 35600 }
    expect(decimalToNumber(decimal)).toBe(35600)
  })

  it('passes through a plain number unchanged', () => {
    expect(decimalToNumber(1120)).toBe(1120)
  })

  it('returns 0 for null/undefined', () => {
    expect(decimalToNumber(null)).toBe(0)
    expect(decimalToNumber(undefined)).toBe(0)
  })
})
