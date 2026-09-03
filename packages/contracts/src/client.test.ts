import { describe, expect, it } from 'vitest'
import { clientSchema, type Client } from './client'

function validClient(): Client {
  return {
    id: 'client-001',
    name: 'Juan Pérez',
    active: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('clientSchema', () => {
  it('parses a valid client with required name', () => {
    const client = clientSchema.parse(validClient())
    expect(client.name).toBe('Juan Pérez')
    expect(client.id).toBe('client-001')
  })

  it('rejects when the required name field is missing', () => {
    const { name, ...rest } = validClient()
    void name
    const result = clientSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('parses successfully with optional fields omitted', () => {
    const client = clientSchema.parse(validClient())
    expect('document' in client).toBe(false)
    expect('phone' in client).toBe(false)
    expect('email' in client).toBe(false)
  })

  it('accepts optional fields when present', () => {
    const client = clientSchema.parse({
      ...validClient(),
      document: '12345678',
      phone: '59899123456',
      email: 'juan@example.com',
    })
    expect(client.document).toBe('12345678')
    expect(client.phone).toBe('59899123456')
    expect(client.email).toBe('juan@example.com')
  })

  it('requires active boolean field', () => {
    const client = clientSchema.parse(validClient())
    expect(client.active).toBe(true)
  })

  it('rejects when active is missing', () => {
    const { active, ...rest } = validClient()
    void active
    const result = clientSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('accepts active as false', () => {
    const client = clientSchema.parse({ ...validClient(), active: false })
    expect(client.active).toBe(false)
  })
})
