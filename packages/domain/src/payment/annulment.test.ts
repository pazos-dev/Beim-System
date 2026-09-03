import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  validateAnnulmentReason,
  checkDuplicateAnnulment,
  processAnnulment,
} from './annulment'

describe('validateAnnulmentReason', () => {
  it('accepts a valid reason without throwing', () => {
    expect(() => validateAnnulmentReason('Cliente solicitó')).not.toThrow()
  })

  it('rejects an empty reason', () => {
    expect(() => validateAnnulmentReason('')).toThrow(DomainError)
  })

  it('rejects a whitespace-only reason', () => {
    expect(() => validateAnnulmentReason('   ')).toThrow(DomainError)
  })

  it('throws with ANNULMENT_REASON_REQUIRED code', () => {
    try {
      validateAnnulmentReason('')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.ANNULMENT_REASON_REQUIRED)
    }
  })
})

describe('checkDuplicateAnnulment', () => {
  it('detects a duplicate when both flags are set', () => {
    const receipt = {
      stockRestoredAt: '2026-01-01T10:00:00Z',
      financialReversedAt: '2026-01-01T10:00:00Z',
    }
    expect(checkDuplicateAnnulment(receipt)).toEqual({ duplicate: true })
  })

  it('returns not duplicate when only stockRestoredAt is set', () => {
    const receipt = {
      stockRestoredAt: '2026-01-01T10:00:00Z',
      financialReversedAt: '',
    }
    expect(checkDuplicateAnnulment(receipt)).toEqual({ duplicate: false })
  })

  it('returns not duplicate when only financialReversedAt is set', () => {
    const receipt = {
      stockRestoredAt: '',
      financialReversedAt: '2026-01-01T10:00:00Z',
    }
    expect(checkDuplicateAnnulment(receipt)).toEqual({ duplicate: false })
  })

  it('returns not duplicate when neither flag is set', () => {
    expect(checkDuplicateAnnulment({})).toEqual({ duplicate: false })
  })
})

describe('processAnnulment', () => {
  it('returns duplicate true without stock restorations when receipt is a duplicate', () => {
    const receipt = {
      stockRestoredAt: '2026-01-01T10:00:00Z',
      financialReversedAt: '2026-01-01T10:00:00Z',
    }
    const items = [{ productId: 'p1', quantity: 3 }]
    const result = processAnnulment(receipt, items)
    expect(result.duplicate).toBe(true)
    expect(result.stockRestorations).toEqual([])
  })

  it('restores stock per item on first annulment', () => {
    const receipt = {
      stockRestoredAt: '',
      financialReversedAt: '',
    }
    const items = [
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 1 },
    ]
    const result = processAnnulment(receipt, items)

    expect(result.duplicate).toBe(false)
    expect(result.stockRestorations).toEqual([
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 1 },
    ])
    // Financial reversal is always performed on first processing
    expect(result.financialReversal).toBe(true)
  })

  it('skips invalid items (empty productId or zero quantity)', () => {
    const receipt = {
      stockRestoredAt: '',
      financialReversedAt: '',
    }
    const items = [
      { productId: '', quantity: 0 },
      { productId: 'p1', quantity: 2 },
    ]
    const result = processAnnulment(receipt, items)
    expect(result.duplicate).toBe(false)
    expect(result.stockRestorations).toEqual([{ productId: 'p1', quantity: 2 }])
  })

  it('injects the now timestamp into the result', () => {
    const receipt = {
      stockRestoredAt: '',
      financialReversedAt: '',
    }
    const items = [{ productId: 'p1', quantity: 3 }]
    const now = '2026-05-01T12:00:00Z'
    const result = processAnnulment(receipt, items, now)

    expect(result.annulledAt).toBe('2026-05-01T12:00:00Z')
    expect(result.stockRestoredAt).toBe('2026-05-01T12:00:00Z')
    expect(result.financialReversedAt).toBe('2026-05-01T12:00:00Z')
  })

  it('returns empty stock restorations when no valid items', () => {
    const receipt = {
      stockRestoredAt: '',
      financialReversedAt: '',
    }
    const items = [{ productId: '', quantity: 0 }]
    const result = processAnnulment(receipt, items)
    expect(result.stockRestorations).toEqual([])
  })
})
