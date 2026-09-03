import { describe, expect, it } from 'vitest'
import { userSchema, type User } from './user'

function validUser(): User {
  return {
    id: '3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b',
    name: 'Ana García',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
    role: 'cliente',
    isWholesaler: false,
    isBeim: false,
    isApproved: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('userSchema', () => {
  it('parses a valid user with required fields', () => {
    const user = userSchema.parse(validUser())
    expect(user.name).toBe('Ana García')
    expect(user.role).toBe('cliente')
    expect(user.passwordHash).toBe('$2b$10$abcdefghijklmnopqrstuv')
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validUser()
    void name
    const result = userSchema.safeParse(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'name')).toBe(true)
    }
  })

  it('rejects when the required passwordHash field is missing', () => {
    const { passwordHash, ...rest } = validUser()
    void passwordHash
    const result = userSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid role enum value', () => {
    const result = userSchema.safeParse({ ...validUser(), role: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('parses successfully with optional fields omitted', () => {
    const user = userSchema.parse(validUser())
    expect('phone' in user).toBe(false)
    expect('ci' in user).toBe(false)
    expect(user.isApproved).toBe(false)
  })

  it('accepts optional fields when present', () => {
    const user = userSchema.parse({
      ...validUser(),
      phone: '59899123456',
      ci: '12345678',
      email: 'ana@example.com',
    })
    expect(user.phone).toBe('59899123456')
    expect(user.ci).toBe('12345678')
    expect(user.email).toBe('ana@example.com')
  })

  it('rejects a non-uuid id', () => {
    const result = userSchema.safeParse({ ...validUser(), id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})
