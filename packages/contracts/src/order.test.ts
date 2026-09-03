import { describe, expect, it } from 'vitest'
import { orderSchema, type Order } from './order'

function validOrder(): Order {
  return {
    id: 'ord-001',
    customer: 'Ana García',
    total: 0.01,
    currency: 'UYU',
    status: 'Pendiente',
    paymentStatus: 'Pendiente de pago',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }
}

describe('orderSchema', () => {
  it('parses a valid order, preserving money decimals', () => {
    const order = orderSchema.parse(validOrder())
    expect(order.total).toBe(0.01)
    expect(order.currency).toBe('UYU')
    expect(order.status).toBe('Pendiente')
    expect(order.paymentStatus).toBe('Pendiente de pago')
  })

  it('rejects when the required customer field is missing', () => {
    const { customer, ...rest } = validOrder()
    void customer
    const result = orderSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects an invalid order status enum value', () => {
    const result = orderSchema.safeParse({ ...validOrder(), status: 'Unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid payment status enum value', () => {
    const result = orderSchema.safeParse({ ...validOrder(), paymentStatus: 'Aprobado' })
    expect(result.success).toBe(false)
  })

  it('parses successfully with optional fields omitted', () => {
    const order = orderSchema.parse(validOrder())
    expect('email' in order).toBe(false)
    expect('phone' in order).toBe(false)
    expect('stockCommitted' in order).toBe(false)
  })

  it('accepts optional fields when present', () => {
    const order = orderSchema.parse({
      ...validOrder(),
      email: 'ana@example.com',
      userId: '3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b',
      stockCommitted: false,
    })
    expect(order.email).toBe('ana@example.com')
    expect(order.userId).toBe('3f2b7e9a-1d4c-4e8f-9a2b-6c5d4e3f2a1b')
    expect(order.stockCommitted).toBe(false)
  })
})
