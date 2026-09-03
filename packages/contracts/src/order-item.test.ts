import { describe, expect, it } from 'vitest'
import { orderItemSchema, type OrderItem } from './order-item'

function validOrderItem(): OrderItem {
  return {
    id: 1,
    orderId: 'ord-001',
    productName: 'Funda iPhone 15',
    quantity: 2,
    unitPrice: 500.5,
  }
}

describe('orderItemSchema', () => {
  it('parses a valid order item with integer quantity', () => {
    const item = orderItemSchema.parse(validOrderItem())
    expect(item.quantity).toBe(2)
    expect(item.unitPrice).toBe(500.5)
    expect(item.orderId).toBe('ord-001')
  })

  it('rejects when the required orderId field is missing', () => {
    const { orderId, ...rest } = validOrderItem()
    void orderId
    const result = orderItemSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects a quantity of zero', () => {
    const result = orderItemSchema.safeParse({ ...validOrderItem(), quantity: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects a negative quantity', () => {
    const result = orderItemSchema.safeParse({ ...validOrderItem(), quantity: -3 })
    expect(result.success).toBe(false)
  })

  it('rejects a non-integer quantity', () => {
    const result = orderItemSchema.safeParse({ ...validOrderItem(), quantity: 2.5 })
    expect(result.success).toBe(false)
  })

  it('rejects a type mismatch on unitPrice', () => {
    const result = orderItemSchema.safeParse({ ...validOrderItem(), unitPrice: 'x' })
    expect(result.success).toBe(false)
  })
})
