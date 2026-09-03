import { describe, expect, it } from 'vitest'
import { clientSchema } from '@beim/contracts'
import { toClientContract } from './client'

function prismaClientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cliente-1',
    name: 'Juan Pérez',
    document: '12345678',
    phone: '59899000111',
    email: 'juan@example.com',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('toClientContract', () => {
  it('maps a fully populated row to a valid Client contract', () => {
    const result = toClientContract(prismaClientRow())
    expect(clientSchema.parse(result)).toEqual(result)
    expect(result.name).toBe('Juan Pérez')
    expect(result.document).toBe('12345678')
  })

  it('omits optional fields that are empty strings', () => {
    const result = toClientContract(
      prismaClientRow({ document: '', phone: '', email: '' }),
    )
    expect('document' in result).toBe(false)
    expect('phone' in result).toBe(false)
    expect('email' in result).toBe(false)
  })

  it('keeps camelCase timestamp fields', () => {
    const result = toClientContract(prismaClientRow())
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-02T00:00:00Z'))
  })
})
