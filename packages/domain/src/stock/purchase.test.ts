import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  computeWeightedAverageCost,
  validatePurchase,
  validatePurchaseAnnulment,
} from './purchase'

describe('computeWeightedAverageCost', () => {
  it('computes weighted average cost with positive stock', () => {
    // (10 * 100 + 5 * 120) / (10 + 5) = (1000 + 600) / 15 = 1600/15 ≈ 106.67
    const result = computeWeightedAverageCost(10, 100, 5, 120)
    expect(result).toBeCloseTo(106.67, 2)
  })

  it('uses newCost when starting from zero stock', () => {
    expect(computeWeightedAverageCost(0, 0, 5, 120)).toBe(120)
  })

  it('returns newCost when combined stock equals zero', () => {
    expect(computeWeightedAverageCost(0, 200, 0, 150)).toBe(150)
  })

  it('handles negative old stock edge', () => {
    const result = computeWeightedAverageCost(-3, 100, 5, 120)
    // (-3*100 + 5*120) / (2) = (-300 + 600)/2 = 150
    expect(result).toBe(150)
  })
})

interface PurchaseInput {
  productId?: string
  quantity?: number
  unitCost?: number
  categoryId?: string
  brand?: string
  model?: string
}

describe('validatePurchase', () => {
  const validPurchase: PurchaseInput = {
    productId: 'p1',
    quantity: 5,
    unitCost: 120,
    categoryId: 'c1',
    brand: 'Samsung',
    model: 'A54',
  }

  it('accepts a valid purchase', () => {
    expect(() => validatePurchase(validPurchase)).not.toThrow()
  })

  it('rejects missing productId', () => {
    const { productId: _omit, ...rest } = validPurchase
    expect(() => validatePurchase(rest)).toThrow(DomainError)
  })

  it('rejects missing categoryId', () => {
    expect(() => validatePurchase({ ...validPurchase, categoryId: '' }))
      .toThrow(DomainError)
  })

  it('rejects negative quantity', () => {
    expect(() => validatePurchase({ ...validPurchase, quantity: -1 }))
      .toThrow(DomainError)
  })

  it('rejects zero quantity', () => {
    expect(() => validatePurchase({ ...validPurchase, quantity: 0 }))
      .toThrow(DomainError)
  })

  it('rejects non-integer quantity', () => {
    expect(() => validatePurchase({ ...validPurchase, quantity: 2.5 }))
      .toThrow(DomainError)
  })

  it('rejects negative unitCost', () => {
    expect(() => validatePurchase({ ...validPurchase, unitCost: -10 }))
      .toThrow(DomainError)
  })

  it('rejects missing brand', () => {
    expect(() => validatePurchase({ ...validPurchase, brand: '' }))
      .toThrow(DomainError)
  })

  it('rejects missing model', () => {
    expect(() => validatePurchase({ ...validPurchase, model: '' }))
      .toThrow(DomainError)
  })

  it('throws with INVALID_PURCHASE code', () => {
    try {
      validatePurchase({ ...validPurchase, quantity: -1 })
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.INVALID_PURCHASE)
    }
  })
})

describe('validatePurchaseAnnulment', () => {
  it('accepts sufficient stock for reversal', () => {
    expect(() => validatePurchaseAnnulment(10, 5)).not.toThrow()
  })

  it('accepts exact boundary stock', () => {
    expect(() => validatePurchaseAnnulment(5, 5)).not.toThrow()
  })

  it('rejects insufficient stock for reversal', () => {
    expect(() => validatePurchaseAnnulment(3, 5)).toThrow(DomainError)
  })

  it('throws with INSUFFICIENT_STOCK code', () => {
    try {
      validatePurchaseAnnulment(3, 5)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.INSUFFICIENT_STOCK)
    }
  })
})
