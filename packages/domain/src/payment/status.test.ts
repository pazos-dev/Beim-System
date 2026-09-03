import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  normalizePaymentStatus,
  validateStockCommitmentGuard,
  computeStockDeductions,
  mapWebPaymentStatus,
} from './status'

describe('normalizePaymentStatus', () => {
  it('maps Pagado to Pagado', () => {
    expect(normalizePaymentStatus('Pagado')).toBe('Pagado')
  })

  it('maps Parcial to Seña', () => {
    expect(normalizePaymentStatus('Parcial')).toBe('Seña')
  })

  it('maps Seña to Seña', () => {
    expect(normalizePaymentStatus('Seña')).toBe('Seña')
  })

  it('maps Sena (no accent) to Seña', () => {
    expect(normalizePaymentStatus('Sena')).toBe('Seña')
  })

  it('defaults empty string to Sin abonar', () => {
    expect(normalizePaymentStatus('')).toBe('Sin abonar')
  })

  it('defaults unknown values to Sin abonar', () => {
    expect(normalizePaymentStatus('otro')).toBe('Sin abonar')
  })
})

describe('validateStockCommitmentGuard', () => {
  it('blocks reverting from Pagado when stock is committed', () => {
    expect(() =>
      validateStockCommitmentGuard('Pagado', 'Pendiente de pago', true),
    ).toThrow(DomainError)
  })

  it('throws with STOCK_COMMITTED code', () => {
    try {
      validateStockCommitmentGuard('Pagado', 'Pendiente de pago', true)
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.STOCK_COMMITTED)
    }
  })

  it('allows reverting when stock is not committed', () => {
    expect(() =>
      validateStockCommitmentGuard('Pagado', 'Pendiente de pago', false),
    ).not.toThrow()
  })

  it('allows transition to Pagado regardless of commit state', () => {
    expect(() =>
      validateStockCommitmentGuard('Pendiente de pago', 'Pagado', true),
    ).not.toThrow()
  })

  it('allows unrelated transitions between non-paid statuses', () => {
    expect(() =>
      validateStockCommitmentGuard('Parcial', 'Rechazado', false),
    ).not.toThrow()
  })
})

describe('computeStockDeductions', () => {
  it('returns deduction array for items with productId and quantity', () => {
    const items = [
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
      { productId: '', quantity: 3 },
    ]
    const result = computeStockDeductions(items)
    expect(result).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ])
  })

  it('filters out items with zero quantity', () => {
    const items = [
      { productId: 'p1', quantity: 0 },
      { productId: 'p2', quantity: 5 },
    ]
    const result = computeStockDeductions(items)
    expect(result).toEqual([{ productId: 'p2', quantity: 5 }])
  })

  it('returns empty array for no items', () => {
    expect(computeStockDeductions([])).toEqual([])
  })
})

describe('mapWebPaymentStatus', () => {
  it('maps Pendiente de pago to Sin abonar', () => {
    expect(mapWebPaymentStatus('Pendiente de pago')).toBe('Sin abonar')
  })

  it('maps Parcial to Seña', () => {
    expect(mapWebPaymentStatus('Parcial')).toBe('Seña')
  })

  it('maps Pagado to Pagado', () => {
    expect(mapWebPaymentStatus('Pagado')).toBe('Pagado')
  })

  it('maps unknown statuses to Sin abonar', () => {
    expect(mapWebPaymentStatus('otro')).toBe('Sin abonar')
  })
})
