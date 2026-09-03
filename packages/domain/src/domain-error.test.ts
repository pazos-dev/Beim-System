import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from './domain-error'

describe('DomainError', () => {
  it('instantiates with a code and message', () => {
    const error = new DomainError(ErrorCodes.INVALID_STATUS, 'Estado no válido')
    expect(error.code).toBe('INVALID_STATUS')
    expect(error.message).toBe('Estado no válido')
  })

  it('is an instance of the native Error class', () => {
    const error = new DomainError(ErrorCodes.INSUFFICIENT_STOCK, 'stock insuficiente')
    expect(error instanceof Error).toBe(true)
  })

  it('sets the error name to "DomainError"', () => {
    const error = new DomainError(ErrorCodes.STOCK_COMMITTED, 'stock comprometido')
    expect(error.name).toBe('DomainError')
  })

  it('allows matching by error code for machine-readable handling', () => {
    const error = new DomainError(ErrorCodes.ANNULMENT_REASON_REQUIRED, 'falta motivo')
    try {
      throw error
    } catch (caught) {
      expect(caught instanceof DomainError).toBe(true)
      expect((caught as DomainError).code).toBe('ANNULMENT_REASON_REQUIRED')
    }
  })
})
