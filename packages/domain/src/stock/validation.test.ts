import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import { validateStockSufficiency, checkMinStockThreshold } from './validation'

describe('validateStockSufficiency', () => {
  it('accepts sufficient stock without throwing', () => {
    expect(() => validateStockSufficiency(10, 5)).not.toThrow()
  })

  it('accepts exact boundary stock', () => {
    expect(() => validateStockSufficiency(5, 5)).not.toThrow()
  })

  it('rejects insufficient stock', () => {
    expect(() => validateStockSufficiency(3, 5)).toThrow(DomainError)
  })

  it('throws with INSUFFICIENT_STOCK code', () => {
    try {
      validateStockSufficiency(3, 5)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.INSUFFICIENT_STOCK)
    }
  })
})

describe('checkMinStockThreshold', () => {
  it('flags stock below minimum', () => {
    expect(checkMinStockThreshold(2, 5)).toEqual({ belowMin: true })
  })

  it('does not flag stock above minimum', () => {
    expect(checkMinStockThreshold(10, 5)).toEqual({ belowMin: false })
  })

  it('does not flag stock equal to minimum', () => {
    expect(checkMinStockThreshold(5, 5)).toEqual({ belowMin: false })
  })

  it('does not flag when minStock is not provided', () => {
    expect(checkMinStockThreshold(2, undefined)).toEqual({ belowMin: false })
  })
})
