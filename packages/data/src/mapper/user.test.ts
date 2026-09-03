import { describe, expect, it } from 'vitest'
import type { Prisma } from '@prisma/client'
import { userSchema } from '@beim/contracts'
import { toUserContract } from './user'

type UserRow = Prisma.UserGetPayload<true>

function prismaUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: '3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b',
    name: 'Ana García',
    firstName: 'Ana',
    lastName: 'García',
    username: 'ana',
    email: 'ana@example.com',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    role: 'cliente',
    phone: '59899123456',
    company: 'Beim',
    ci: '12345678',
    rut: null,
    department: null,
    locality: null,
    address: 'Calle 1',
    website: null,
    tradeReferences: null,
    isWholesaler: false,
    isBeim: false,
    isApproved: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-02T00:00:00Z'),
    ...overrides,
  }
}

describe('toUserContract', () => {
  it('maps a fully populated row to a valid User contract', () => {
    const row = prismaUserRow()
    const result = toUserContract(row)
    expect(userSchema.parse(result)).toEqual(result)
    expect(result.name).toBe('Ana García')
    expect(result.firstName).toBe('Ana')
    expect(result.role).toBe('cliente')
    expect(result.isApproved).toBe(true)
  })

  it('passes through the role enum value unchanged', () => {
    for (const role of ['cliente', 'admin', 'superadmin'] as const) {
      const result = toUserContract(prismaUserRow({ role }))
      expect(result.role).toBe(role)
      expect(userSchema.parse(result).role).toBe(role)
    }
  })

  it('maps null optional fields to omitted keys (not null/undefined)', () => {
    const result = toUserContract(prismaUserRow())
    expect('rut' in result).toBe(false)
    expect('department' in result).toBe(false)
    expect('website' in result).toBe(false)
    expect('tradeReferences' in result).toBe(false)
  })

  it('keeps snake_case→camelCase conversion for present fields', () => {
    const result = toUserContract(prismaUserRow())
    expect(result.passwordHash).toBe('$2b$10$abcdefghijklmnopqrstuv')
    expect(result.isWholesaler).toBe(false)
    expect(result.isBeim).toBe(false)
    expect(result.createdAt).toEqual(new Date('2024-01-01T00:00:00Z'))
    expect(result.updatedAt).toEqual(new Date('2024-01-02T00:00:00Z'))
  })

  it('handles null street-level fields (phone, ci, address) as omitted', () => {
    const result = toUserContract(prismaUserRow({ phone: null, ci: null, address: null }))
    expect('phone' in result).toBe(false)
    expect('ci' in result).toBe(false)
    expect('address' in result).toBe(false)
  })
})
