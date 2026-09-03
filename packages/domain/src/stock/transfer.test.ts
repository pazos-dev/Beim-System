import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  validateTransferSource,
  generatePairedTransferMovements,
  deriveDestinationId,
} from './transfer'

describe('validateTransferSource', () => {
  it('accepts a web product with no productType', () => {
    expect(() => validateTransferSource({})).not.toThrow()
  })

  it('accepts a product with an empty productType', () => {
    expect(() => validateTransferSource({ productType: '' })).not.toThrow()
  })

  it('rejects a product with productType taller', () => {
    expect(() => validateTransferSource({ productType: 'taller' })).toThrow(DomainError)
  })

  it('rejects a product with productType repuesto', () => {
    expect(() => validateTransferSource({ productType: 'repuesto' })).toThrow(DomainError)
  })

  it('rejects a product with productType servicio', () => {
    expect(() => validateTransferSource({ productType: 'servicio' })).toThrow(DomainError)
  })

  it('rejects a product with productType insumo', () => {
    expect(() => validateTransferSource({ productType: 'insumo' })).toThrow(DomainError)
  })

  it('rejects a product with productType herramienta', () => {
    expect(() => validateTransferSource({ productType: 'herramienta' })).toThrow(DomainError)
  })

  it('throws with INVALID_TRANSFER_SOURCE code', () => {
    try {
      validateTransferSource({ productType: 'taller' })
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.INVALID_TRANSFER_SOURCE)
    }
  })
})

describe('deriveDestinationId', () => {
  it('derives workshop-web-p1 from source p1', () => {
    expect(deriveDestinationId('p1')).toBe('workshop-web-p1')
  })

  it('prefixes any source id', () => {
    expect(deriveDestinationId('product-42')).toBe('workshop-web-product-42')
  })
})

describe('generatePairedTransferMovements', () => {
  it('creates web_transfer_out (negative) and web_transfer_in (positive) for source', () => {
    const movements = generatePairedTransferMovements('p1', 5)
    expect(movements).toHaveLength(2)

    const out = movements[0]
    const inbound = movements[1]

    expect(out.productId).toBe('p1')
    expect(out.movementType).toBe('web_transfer_out')
    expect(out.quantity).toBe(-5)

    expect(inbound.productId).toBe('workshop-web-p1')
    expect(inbound.movementType).toBe('web_transfer_in')
    expect(inbound.quantity).toBe(5)
  })

  it('creates movements with the same transfer reference', () => {
    const movements = generatePairedTransferMovements('p1', 5)
    const out = movements[0]
    const inbound = movements[1]

    expect(out.referenceType).toBe('stock_transfer')
    expect(inbound.referenceType).toBe('stock_transfer')
    expect(inbound.referenceId).toBe(out.referenceId)
    expect(out.referenceId).toMatch(/^transfer-/)
  })
})
