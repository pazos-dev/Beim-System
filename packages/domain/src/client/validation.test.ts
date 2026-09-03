import { describe, expect, it } from 'vitest'
import { DomainError, ErrorCodes } from '../domain-error'
import {
  validateClientName,
  resolveDefaultClient,
  normalizeDocument,
  applyClientDefaults,
} from './validation'

describe('validateClientName', () => {
  it('accepts a valid name', () => {
    expect(() => validateClientName('Juan Perez')).not.toThrow()
  })

  it('rejects an empty name', () => {
    expect(() => validateClientName('')).toThrow(DomainError)
  })

  it('rejects a whitespace-only name', () => {
    expect(() => validateClientName('   ')).toThrow(DomainError)
  })

  it('throws with CLIENT_NAME_REQUIRED code', () => {
    try {
      validateClientName('')
      expect.fail('Should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      expect((error as DomainError).code).toBe(ErrorCodes.CLIENT_NAME_REQUIRED)
    }
  })

  it('trims surrounding whitespace before validating', () => {
    expect(() => validateClientName('  Juan Perez  ')).not.toThrow()
  })
})

describe('resolveDefaultClient', () => {
  it('returns Cliente Mostrador when no client is provided', () => {
    expect(resolveDefaultClient(undefined)).toBe('Cliente Mostrador')
  })

  it('returns Cliente Mostrador when client is null', () => {
    expect(resolveDefaultClient(null)).toBe('Cliente Mostrador')
  })

  it('preserves an explicit client name', () => {
    expect(resolveDefaultClient({ name: 'Ana Perez' })).toBe('Ana Perez')
  })
})

describe('normalizeDocument', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeDocument('  12345678 ')).toBe('12345678')
  })

  it('defaults an empty document to dash', () => {
    expect(normalizeDocument('')).toBe('-')
  })

  it('defaults a whitespace document to dash', () => {
    expect(normalizeDocument('   ')).toBe('-')
  })

  it('returns dash when document is not provided', () => {
    expect(normalizeDocument(undefined)).toBe('-')
  })
})

describe('applyClientDefaults', () => {
  it('defaults phone to dash when missing', () => {
    const result = applyClientDefaults({ name: 'Ana', document: '123' })
    expect(result.phone).toBe('-')
  })

  it('defaults email to empty string when missing', () => {
    const result = applyClientDefaults({ name: 'Ana', document: '123' })
    expect(result.email).toBe('')
  })

  it('defaults document to dash when missing', () => {
    const result = applyClientDefaults({ name: 'Ana' })
    expect(result.document).toBe('-')
  })

  it('preserves provided phone and email', () => {
    const result = applyClientDefaults({
      name: 'Ana',
      phone: '555-1234',
      email: 'ana@example.com',
    })
    expect(result.phone).toBe('555-1234')
    expect(result.email).toBe('ana@example.com')
  })
})
